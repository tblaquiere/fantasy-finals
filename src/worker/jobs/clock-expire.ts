/**
 * clock.expire handler — Stories 3.9, 5.2
 *
 * Fires when a participant's selection clock expires.
 * For standard draft:
 * 1. Check if participant already submitted a pick (skip if yes)
 * 2. Read their preference list → select first eligible player → "auto — preference list"
 * 3. If no preference list, select random eligible player → "auto — system"
 * 4. If no eligible player at all, skip pick and notify commissioner
 * 5. Advance clock to next participant
 *
 * For Mozgov replacement (mozgov=true):
 * 1. Auto-assign replacement using preference list or random
 * 2. Void original pick and mark window completed
 * 3. Advance to next Mozgov window
 */

import type { Job } from "pg-boss";

import { db } from "~/server/db";
import { SERIES_STUBS } from "~/lib/constants";
import { enqueueJob } from "~/server/services/job-queue";
import { advanceClock } from "~/server/services/draft-window";
import { nbaStatsService, type NbaPlayerStats } from "~/server/services/nba-stats";
import {
  isPlayerEligibleForDraft,
  isPlayerEligibleForMozgov,
} from "~/server/services/eligibility";
import { startNextMozgovClock } from "~/server/services/mozgov-window";

export type ClockExpirePayload = {
  slotId: string;
  leagueId: string;
  gameId: string;
  mozgov?: boolean;
};

export async function handleClockExpire(
  jobs: Job<ClockExpirePayload>[],
): Promise<void> {
  const job = jobs[0];
  if (!job) return;

  const { slotId, leagueId, gameId, mozgov } = job.data;
  console.log(
    `[worker] clock.expire: slotId=${slotId} leagueId=${leagueId} gameId=${gameId} mozgov=${!!mozgov}`,
  );

  // Mozgov replacement clock expired — handle separately
  if (mozgov) {
    await handleMozgovClockExpire(slotId, leagueId, gameId);
    return;
  }

  // Load the draft slot
  const slot = await db.draftSlot.findUnique({
    where: { id: slotId },
    include: {
      participant: { select: { id: true, userId: true } },
      pick: { select: { id: true } },
    },
  });

  if (!slot) {
    console.error(`[worker] clock.expire: slot ${slotId} not found`);
    return;
  }

  // If the participant already submitted a pick, just advance the clock
  if (slot.pick) {
    console.log(
      `[worker] clock.expire: slot ${slotId} already has pick, advancing clock`,
    );
    try {
      await advanceClock(db, gameId, slotId);
    } catch (err) {
      console.error("[worker] clock.expire: advanceClock error:", err);
    }
    return;
  }

  // Load game to get nbaGameId and league seriesId
  const game = await db.game.findUniqueOrThrow({
    where: { id: gameId },
    include: { league: { select: { seriesId: true } } },
  });

  // Get used players for this participant in the series
  const usedPicks = await db.pick.findMany({
    where: {
      participantId: slot.participantId,
      leagueId,
      confirmed: true,
    },
    select: { nbaPlayerId: true },
  });
  const usedPlayerIds = new Set(usedPicks.map((p) => p.nbaPlayerId));

  // Get all confirmed picks in this game (double-draft prevention)
  const gamePicks = await db.pick.findMany({
    where: { gameId, confirmed: true },
    select: { nbaPlayerId: true },
  });
  const pickedPlayerIds = new Set(gamePicks.map((p) => p.nbaPlayerId));

  // Try live box score first; fall back to DB roster for pre-game drafts
  const boxScore = await nbaStatsService.getLiveBoxScore(game.nbaGameId);

  let allPlayers: NbaPlayerStats[];

  if (boxScore) {
    allPlayers = [
      ...boxScore.homeTeam.players,
      ...boxScore.awayTeam.players,
    ];
  } else {
    // Pre-game: use stored roster from NbaPlayer table
    const seriesStub = SERIES_STUBS.find(
      (s) => s.id === game.league.seriesId,
    );
    if (!seriesStub) {
      console.error(
        `[worker] clock.expire: series stub not found for ${game.league.seriesId}`,
      );
      await advanceClockSafe(gameId, slotId);
      return;
    }

    const rosterPlayers = await db.nbaPlayer.findMany({
      where: {
        teamId: { in: [seriesStub.homeTeamId, seriesStub.awayTeamId] },
      },
      select: { nbaPlayerId: true },
    });

    if (rosterPlayers.length === 0) {
      console.error(
        `[worker] clock.expire: no roster players found for series ${game.league.seriesId}`,
      );
      await advanceClockSafe(gameId, slotId);
      return;
    }

    // All rostered players are eligible pre-game
    allPlayers = rosterPlayers.map((p): NbaPlayerStats => ({
      personId: p.nbaPlayerId,
      firstName: "",
      familyName: "",
      jerseyNum: "",
      position: "",
      teamId: 0,
      teamTricode: "",
      minutes: 0,
      points: 0,
      reboundsTotal: 0,
      assists: 0,
      steals: 0,
      blocks: 0,
      status: "ACTIVE",
    }));
  }

  // Build eligibility map
  const eligiblePlayers = allPlayers.filter((p) =>
    isPlayerEligibleForDraft(p, usedPlayerIds, pickedPlayerIds),
  );

  let selectedPlayerId: number | null = null;
  let method = "auto-system";

  // Try preference list first
  const prefItems = await db.preferenceListItem.findMany({
    where: {
      participantId: slot.participantId,
      leagueId,
    },
    orderBy: { rank: "asc" },
  });

  if (prefItems.length > 0) {
    for (const pref of prefItems) {
      if (eligiblePlayers.some((p) => p.personId === pref.nbaPlayerId)) {
        selectedPlayerId = pref.nbaPlayerId;
        method = "auto-preference";
        break;
      }
    }
  }

  // Fallback: random eligible player
  if (selectedPlayerId === null && eligiblePlayers.length > 0) {
    const randomIndex = Math.floor(Math.random() * eligiblePlayers.length);
    selectedPlayerId = eligiblePlayers[randomIndex]!.personId;
    method = "auto-system";
  }

  // No eligible players — notify commissioner
  if (selectedPlayerId === null) {
    console.warn(
      `[worker] clock.expire: no eligible players for slot ${slotId}`,
    );

    // Notify commissioner
    const commissioner = await db.participant.findFirst({
      where: { leagueId, isCommissioner: true },
      select: { userId: true },
    });
    if (commissioner) {
      await enqueueJob("notification.send", {
        userId: commissioner.userId,
        type: "auto-assign-failed",
        leagueId,
        gameId,
        slotId,
        message: "No eligible players — commissioner action required",
      });
    }

    await advanceClockSafe(gameId, slotId);
    return;
  }

  // Create the auto-assigned pick
  try {
    await db.pick.create({
      data: {
        draftSlotId: slotId,
        nbaPlayerId: selectedPlayerId,
        participantId: slot.participantId,
        gameId,
        leagueId,
        method,
        confirmed: true, // auto-assigned picks are immediately confirmed
      },
    });

    console.log(
      `[worker] clock.expire: auto-assigned player ${selectedPlayerId} (${method}) for slot ${slotId}`,
    );
  } catch (err) {
    // Unique constraint violation — player was just picked by someone else
    console.error("[worker] clock.expire: pick create error:", err);
  }

  await advanceClockSafe(gameId, slotId);
}

async function advanceClockSafe(gameId: string, slotId: string) {
  try {
    await advanceClock(db, gameId, slotId);
  } catch (err) {
    console.error("[worker] clock.expire: advanceClock error:", err);
  }
}

/**
 * Handle Mozgov replacement clock expiry.
 * Auto-assigns a replacement player using preference list or random,
 * voids the original pick, and advances to the next Mozgov window.
 */
async function handleMozgovClockExpire(
  windowId: string,
  leagueId: string,
  gameId: string,
): Promise<void> {
  const mozgovWindow = await db.mozgovWindow.findUnique({
    where: { id: windowId },
    include: {
      participant: { select: { id: true, userId: true } },
    },
  });

  if (!mozgovWindow || mozgovWindow.status !== "active") {
    console.log(
      `[worker] clock.expire: mozgov window ${windowId} not active, skipping`,
    );
    await startNextMozgovClock(db, gameId, leagueId);
    return;
  }

  // Already has replacement — just advance
  if (mozgovWindow.replacementPickId) {
    await db.mozgovWindow.update({
      where: { id: windowId },
      data: { status: "completed" },
    });
    await startNextMozgovClock(db, gameId, leagueId);
    return;
  }

  const game = await db.game.findUniqueOrThrow({ where: { id: gameId } });

  // Get used players for this participant
  const usedPicks = await db.pick.findMany({
    where: { participantId: mozgovWindow.participantId, leagueId, confirmed: true },
    select: { nbaPlayerId: true },
  });
  const usedPlayerIds = new Set(usedPicks.map((p) => p.nbaPlayerId));

  // Fetch live box score
  const boxScore = await nbaStatsService.getLiveBoxScore(game.nbaGameId);
  if (!boxScore) {
    console.error(
      `[worker] clock.expire: mozgov — could not fetch box score`,
    );
    await db.mozgovWindow.update({
      where: { id: windowId },
      data: { status: "expired" },
    });
    await startNextMozgovClock(db, gameId, leagueId);
    return;
  }

  const allPlayers = [
    ...boxScore.homeTeam.players,
    ...boxScore.awayTeam.players,
  ];

  // Get most recent active minutes for each player from prior games
  const leagueGames = await db.game.findMany({
    where: { leagueId },
    orderBy: { gameNumber: "desc" },
    select: { nbaGameId: true, id: true },
  });
  const priorNbaGameIds = leagueGames
    .filter((g) => g.id !== gameId)
    .map((g) => g.nbaGameId);

  const priorBoxScores = await db.boxScore.findMany({
    where: {
      nbaGameId: { in: priorNbaGameIds },
      minutes: { gt: 0 },
    },
    orderBy: { period: "desc" },
    select: { nbaPlayerId: true, minutes: true },
  });

  // Map: playerId → most recent active minutes
  const recentMinutesMap = new Map<number, number>();
  for (const bs of priorBoxScores) {
    if (!recentMinutesMap.has(bs.nbaPlayerId)) {
      recentMinutesMap.set(bs.nbaPlayerId, bs.minutes);
    }
  }

  // Filter eligible players for Mozgov replacement
  const eligiblePlayers = allPlayers.filter((p) =>
    isPlayerEligibleForMozgov(
      p,
      usedPlayerIds,
      recentMinutesMap.get(p.personId) ?? null,
    ),
  );

  let selectedPlayerId: number | null = null;
  let method = "mozgov-auto-system";

  // Try preference list first
  const prefItems = await db.preferenceListItem.findMany({
    where: { participantId: mozgovWindow.participantId, leagueId },
    orderBy: { rank: "asc" },
  });

  if (prefItems.length > 0) {
    for (const pref of prefItems) {
      if (eligiblePlayers.some((p) => p.personId === pref.nbaPlayerId)) {
        selectedPlayerId = pref.nbaPlayerId;
        method = "mozgov-auto-preference";
        break;
      }
    }
  }

  // Fallback: random
  if (selectedPlayerId === null && eligiblePlayers.length > 0) {
    const randomIndex = Math.floor(Math.random() * eligiblePlayers.length);
    selectedPlayerId = eligiblePlayers[randomIndex]!.personId;
    method = "mozgov-auto-system";
  }

  if (selectedPlayerId === null) {
    console.warn(
      `[worker] clock.expire: mozgov — no eligible replacement for window ${windowId}`,
    );
    await db.mozgovWindow.update({
      where: { id: windowId },
      data: { status: "expired" },
    });

    const commissioner = await db.participant.findFirst({
      where: { leagueId, isCommissioner: true },
      select: { userId: true },
    });
    if (commissioner) {
      await enqueueJob("notification.send", {
        userId: commissioner.userId,
        type: "no-eligible-player",
        leagueId,
        gameId,
      });
    }

    await startNextMozgovClock(db, gameId, leagueId);
    return;
  }

  // Create replacement pick (no draftSlot — Mozgov picks are separate)
  const replacementPick = await db.pick.create({
    data: {
      nbaPlayerId: selectedPlayerId,
      participantId: mozgovWindow.participantId,
      gameId,
      leagueId,
      method,
      confirmed: true,
    },
  });

  // Void original and update window
  await db.$transaction([
    db.pick.update({
      where: { id: mozgovWindow.originalPickId },
      data: { voidedByMozgov: true, confirmed: false },
    }),
    db.mozgovWindow.update({
      where: { id: windowId },
      data: {
        status: "completed",
        replacementPickId: replacementPick.id,
      },
    }),
  ]);

  console.log(
    `[worker] clock.expire: mozgov auto-assigned player ${selectedPlayerId} (${method}) for window ${windowId}`,
  );

  await startNextMozgovClock(db, gameId, leagueId);
}
