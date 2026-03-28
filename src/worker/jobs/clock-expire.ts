/**
 * clock.expire handler — Story 3.9
 *
 * Fires when a participant's selection clock expires.
 * 1. Check if participant already submitted a pick (skip if yes)
 * 2. Read their preference list → select first eligible player → "auto — preference list"
 * 3. If no preference list, select random eligible player → "auto — system"
 * 4. If no eligible player at all, skip pick and notify commissioner
 * 5. Advance clock to next participant
 */

import type { Job } from "pg-boss";

import { db } from "~/server/db";
import { enqueueJob } from "~/server/services/job-queue";
import { advanceClock } from "~/server/services/draft-window";
import { nbaStatsService } from "~/server/services/nba-stats";
import { isPlayerEligibleForDraft } from "~/server/services/eligibility";

export type ClockExpirePayload = {
  slotId: string;
  leagueId: string;
  gameId: string;
};

export async function handleClockExpire(
  jobs: Job<ClockExpirePayload>[],
): Promise<void> {
  const job = jobs[0];
  if (!job) return;

  const { slotId, leagueId, gameId } = job.data;
  console.log(
    `[worker] clock.expire: slotId=${slotId} leagueId=${leagueId} gameId=${gameId}`,
  );

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

  // Load game to get nbaGameId
  const game = await db.game.findUniqueOrThrow({
    where: { id: gameId },
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

  // Fetch live box score for eligibility checks
  const boxScore = await nbaStatsService.getLiveBoxScore(game.nbaGameId);
  if (!boxScore) {
    console.error(
      `[worker] clock.expire: could not fetch box score for ${game.nbaGameId}`,
    );
    await advanceClockSafe(gameId, slotId);
    return;
  }

  const allPlayers = [
    ...boxScore.homeTeam.players,
    ...boxScore.awayTeam.players,
  ];

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
