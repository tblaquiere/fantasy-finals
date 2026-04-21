/**
 * Draft Window Service — Stories 3.4, 3.11
 *
 * Manages the draft window lifecycle: opening, clock advancement, closing,
 * and turn notifications.
 */

import type { PrismaClient } from "generated/prisma";
import { enqueueJob } from "~/server/services/job-queue";
import { nbaStatsService, type NbaPlayerStats } from "~/server/services/nba-stats";
import { SERIES_STUBS, LIVE_SCORE_POLL_INTERVAL_MS } from "~/lib/constants";
import { isPlayerEligibleForDraft } from "~/server/services/eligibility";

/**
 * Advance the selection clock after a pick is submitted.
 * Stops the current slot's clock and starts the next participant's clock.
 * Returns the new active slot, or null if all picks are done.
 */
export async function advanceClock(
  db: PrismaClient,
  gameId: string,
  completedSlotId: string,
) {
  const game = await db.game.findUniqueOrThrow({
    where: { id: gameId },
    include: {
      league: { select: { id: true, clockDurationMinutes: true } },
      draftSlots: { orderBy: { pickPosition: "asc" } },
    },
  });

  const completedSlotIndex = game.draftSlots.findIndex(
    (s) => s.id === completedSlotId,
  );
  if (completedSlotIndex === -1) {
    throw new Error(`Slot ${completedSlotId} not found in game ${gameId}`);
  }

  const nextSlot = game.draftSlots[completedSlotIndex + 1];

  // Clear the completed slot's clock
  await db.draftSlot.update({
    where: { id: completedSlotId },
    data: { clockExpiresAt: null },
  });

  if (!nextSlot) {
    // All picks done — no more clocks to start
    return null;
  }

  const now = new Date();
  const clockExpiresAt = new Date(
    now.getTime() + game.league.clockDurationMinutes * 60 * 1000,
  );

  // Start next slot's clock
  await db.draftSlot.update({
    where: { id: nextSlot.id },
    data: { clockStartsAt: now, clockExpiresAt },
  });

  // Schedule clock.expire for the next slot
  await enqueueJob(
    "clock.expire",
    { slotId: nextSlot.id, leagueId: game.league.id, gameId },
    { startAfter: clockExpiresAt },
  );

  // Notify next participant it's their turn (Story 3.11)
  const nextParticipant = await db.participant.findUnique({
    where: { id: nextSlot.participantId },
    select: { userId: true },
  });
  if (nextParticipant) {
    await enqueueJob("notification.send", {
      userId: nextParticipant.userId,
      type: "your-turn",
      leagueId: game.league.id,
      gameId,
      link: `/draft/${gameId}/pick?leagueId=${game.league.id}`,
    });

    // Schedule pick reminder for 10 min before expiry
    const reminderAt = new Date(clockExpiresAt.getTime() - 10 * 60 * 1000);
    if (reminderAt > now) {
      await enqueueJob(
        "notification.send",
        {
          userId: nextParticipant.userId,
          type: "pick-reminder",
          leagueId: game.league.id,
          gameId,
          link: `/draft/${gameId}/pick?leagueId=${game.league.id}`,
        },
        { startAfter: reminderAt },
      );
    }
  }

  return nextSlot;
}

/**
 * Close the draft window. Sets game status to 'active' and clears any running clocks.
 * Called when tip-off time is reached.
 */
export async function closeDraftWindow(
  db: PrismaClient,
  gameId: string,
) {
  const game = await db.game.findUniqueOrThrow({
    where: { id: gameId },
    include: { league: { select: { id: true, seriesId: true } } },
  });

  // Try to resolve a real NBA game ID if the current one is a placeholder
  let nbaGameId = game.nbaGameId;
  if (nbaGameId.startsWith("game")) {
    const resolved = await resolveNbaGameId(game.league.seriesId);
    if (resolved) {
      nbaGameId = resolved;
    } else {
      console.warn(
        `[draft-window] Could not resolve real NBA game ID for series ${game.league.seriesId}. ` +
        `Score polling will not work until nbaGameId is set correctly.`,
      );
    }
  }

  await db.$transaction([
    db.game.update({
      where: { id: gameId },
      data: { status: "active", nbaGameId },
    }),
    // Clear all running clocks
    db.draftSlot.updateMany({
      where: {
        gameId,
        clockExpiresAt: { not: null },
      },
      data: { clockStartsAt: null, clockExpiresAt: null },
    }),
  ]);

  // Auto-assign picks for any slots that don't have one yet
  await autoAssignMissingPicks(db, gameId, game.league.id, game.league.seriesId);

  // Bootstrap score polling
  await enqueueJob(
    "scores.poll",
    { leagueId: game.league.id, gameId },
    { startAfter: new Date(Date.now() + LIVE_SCORE_POLL_INTERVAL_MS) },
  );
}

/**
 * Try to find today's NBA game matching the league's series teams.
 * Returns the real NBA gameId (e.g. "0042500101") or null if not found.
 */
async function resolveNbaGameId(
  seriesId: string,
): Promise<string | null> {
  const stub = SERIES_STUBS.find((s) => s.id === seriesId);
  if (!stub) return null;

  const scoreboard = await nbaStatsService.getTodaysScoreboard();
  if (!scoreboard) return null;

  // Match by team IDs — either team could be home/away
  const teamIds = new Set<number>([stub.homeTeamId, stub.awayTeamId]);
  const match = scoreboard.games.find(
    (g) => teamIds.has(g.homeTeam.teamId) && teamIds.has(g.awayTeam.teamId),
  );

  if (match) {
    console.log(
      `[draft-window] Resolved NBA game ID: ${match.gameId} for series ${seriesId}`,
    );
    return match.gameId;
  }

  return null;
}

/**
 * Auto-assign picks for any draft slots that don't have a pick yet.
 * Uses preference list → random fallback, same as clock.expire.
 * Called when closing the draft window or as a commissioner backfill.
 */
export async function autoAssignMissingPicks(
  db: PrismaClient,
  gameId: string,
  leagueId: string,
  seriesId: string,
): Promise<number> {
  // Get all slots
  const slots = await db.draftSlot.findMany({
    where: { gameId },
    orderBy: { pickPosition: "asc" },
  });

  // Find participants who have NO pick at all for this game (any status)
  const allPicks = await db.pick.findMany({
    where: { gameId },
    select: { participantId: true },
  });
  const participantsWithPicks = new Set(allPicks.map((p) => p.participantId));
  const unpickedSlots = slots.filter(
    (s) => !participantsWithPicks.has(s.participantId),
  );
  if (unpickedSlots.length === 0) return 0;

  // Get the game's nbaGameId for roster lookup
  const game = await db.game.findUniqueOrThrow({
    where: { id: gameId },
  });

  // Try live box score first; fall back to DB roster
  const boxScore = await nbaStatsService.getLiveBoxScore(game.nbaGameId);
  let allPlayers: NbaPlayerStats[];

  if (boxScore) {
    allPlayers = [
      ...boxScore.homeTeam.players,
      ...boxScore.awayTeam.players,
    ];
  } else {
    const stub = SERIES_STUBS.find((s) => s.id === seriesId);
    if (!stub) return 0;

    const rosterPlayers = await db.nbaPlayer.findMany({
      where: { teamId: { in: [stub.homeTeamId, stub.awayTeamId] } },
      select: { nbaPlayerId: true },
    });

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

  let assignedCount = 0;

  for (const slot of unpickedSlots) {
    // Get used players for this participant in the series
    const usedPicks = await db.pick.findMany({
      where: { participantId: slot.participantId, leagueId, confirmed: true },
      select: { nbaPlayerId: true },
    });
    const usedPlayerIds = new Set(usedPicks.map((p) => p.nbaPlayerId));

    // Get all confirmed picks in this game (double-draft prevention)
    const gamePicks = await db.pick.findMany({
      where: { gameId, confirmed: true },
      select: { nbaPlayerId: true },
    });
    const pickedPlayerIds = new Set(gamePicks.map((p) => p.nbaPlayerId));

    const eligiblePlayers = allPlayers.filter((p) =>
      isPlayerEligibleForDraft(p, usedPlayerIds, pickedPlayerIds),
    );

    let selectedPlayerId: number | null = null;
    let method = "auto-system";

    // Try preference list
    const prefItems = await db.preferenceListItem.findMany({
      where: { participantId: slot.participantId, leagueId },
      orderBy: { rank: "asc" },
    });

    for (const pref of prefItems) {
      if (eligiblePlayers.some((p) => p.personId === pref.nbaPlayerId)) {
        selectedPlayerId = pref.nbaPlayerId;
        method = "auto-preference";
        break;
      }
    }

    // Fallback: random
    if (selectedPlayerId === null && eligiblePlayers.length > 0) {
      const randomIndex = Math.floor(Math.random() * eligiblePlayers.length);
      selectedPlayerId = eligiblePlayers[randomIndex]!.personId;
      method = "auto-system";
    }

    if (selectedPlayerId !== null) {
      try {
        await db.pick.create({
          data: {
            draftSlotId: slot.id,
            nbaPlayerId: selectedPlayerId,
            participantId: slot.participantId,
            gameId,
            leagueId,
            method,
            confirmed: true,
          },
        });
        assignedCount++;
        console.log(
          `[draft-window] Auto-assigned player ${selectedPlayerId} (${method}) for slot ${slot.id}`,
        );
      } catch (err) {
        console.error(`[draft-window] Auto-assign error for slot ${slot.id}:`, err);
      }
    }
  }

  return assignedCount;
}

/**
 * Open the draft window manually (commissioner fallback).
 * Same logic as draft.open handler but callable from tRPC.
 */
export async function openDraftWindow(
  db: PrismaClient,
  gameId: string,
) {
  const game = await db.game.findUniqueOrThrow({
    where: { id: gameId },
    include: {
      league: { select: { id: true, clockDurationMinutes: true } },
      draftSlots: {
        orderBy: { pickPosition: "asc" },
        include: { pick: { select: { id: true } } },
      },
    },
  });

  if (game.status !== "pending" && game.status !== "active") {
    throw new Error(`Cannot open draft: game status is ${game.status}`);
  }

  // Find the first slot that doesn't have a pick yet
  const nextSlot = game.draftSlots.find((s) => !s.pick) ?? game.draftSlots[0];
  if (!nextSlot) {
    throw new Error("No draft slots found for this game");
  }

  const now = new Date();
  const clockExpiresAt = new Date(
    now.getTime() + game.league.clockDurationMinutes * 60 * 1000,
  );

  await db.$transaction([
    db.game.update({
      where: { id: gameId },
      data: { status: "draft-open" },
    }),
    db.draftSlot.update({
      where: { id: nextSlot.id },
      data: { clockStartsAt: now, clockExpiresAt },
    }),
  ]);

  await enqueueJob(
    "clock.expire",
    { slotId: nextSlot.id, leagueId: game.league.id, gameId },
    { startAfter: clockExpiresAt },
  );

  return nextSlot;
}

export type DraftStatusResult = {
  status: string;
  draftOpensAt: Date | null;
  draftClosesAt: Date | null;
  activeSlot: {
    id: string;
    participantId: string;
    pickPosition: number;
    clockStartsAt: Date | null;
    clockExpiresAt: Date | null;
  } | null;
  slots: Array<{
    id: string;
    participantId: string;
    pickPosition: number;
    clockStartsAt: Date | null;
    clockExpiresAt: Date | null;
  }>;
};

/**
 * Get the current draft status for a game.
 * Returns game status, active slot (whose turn), clock expiry, and all slots.
 */
export async function getDraftStatus(
  db: PrismaClient,
  gameId: string,
): Promise<DraftStatusResult> {
  const game = await db.game.findUniqueOrThrow({
    where: { id: gameId },
    include: {
      draftSlots: {
        orderBy: { pickPosition: "asc" },
        select: {
          id: true,
          participantId: true,
          pickPosition: true,
          clockStartsAt: true,
          clockExpiresAt: true,
        },
      },
    },
  });

  // The active slot is the one with a running clock (clockExpiresAt in the future)
  const now = new Date();
  const activeSlot =
    game.draftSlots.find(
      (s) => s.clockExpiresAt && s.clockExpiresAt > now,
    ) ?? null;

  return {
    status: game.status,
    draftOpensAt: game.draftOpensAt,
    draftClosesAt: game.draftClosesAt,
    activeSlot,
    slots: game.draftSlots,
  };
}
