/**
 * halftime.check handler — Story 5.1
 *
 * Polls during halftime to detect Mozgov Rule triggers.
 * For each confirmed pick in the game, checks if the player is active
 * but played fewer than MOZGOV_THRESHOLD_MINUTES in the first half.
 * Creates MozgovWindow records and notifies affected participants.
 *
 * Self-scheduling: re-enqueues itself every 30s while halftime is active
 * and there are still unresolved Mozgov windows.
 */

import type { Job } from "pg-boss";

import { db } from "~/server/db";
import { enqueueJob } from "~/server/services/job-queue";
import { nbaStatsService } from "~/server/services/nba-stats";
import { isMozgovTriggered } from "~/server/services/eligibility";
import { startNextMozgovClock } from "~/server/services/mozgov-window";

export type HalftimeCheckPayload = {
  gameId: string;
  leagueId: string;
};

const HALFTIME_POLL_INTERVAL_MS = 30_000;

export async function handleHalftimeCheck(
  jobs: Job<HalftimeCheckPayload>[],
): Promise<void> {
  const job = jobs[0];
  if (!job) return;

  const { gameId, leagueId } = job.data;
  console.log(
    `[worker] halftime.check: gameId=${gameId} leagueId=${leagueId}`,
  );

  // Load the game with confirmed picks and draft order
  const game = await db.game.findUnique({
    where: { id: gameId },
    include: {
      picks: {
        where: { confirmed: true, voidedByMozgov: false },
        include: {
          participant: { select: { id: true, userId: true } },
          draftSlot: { select: { pickPosition: true } },
        },
      },
      mozgovWindows: true,
    },
  });

  if (!game) {
    console.error(`[worker] halftime.check: game ${gameId} not found`);
    return;
  }

  if (game.status !== "active") {
    console.log(
      `[worker] halftime.check: game ${gameId} status is ${game.status}, skipping`,
    );
    return;
  }

  // Fetch live box score to check halftime status
  const boxScore = await nbaStatsService.getLiveBoxScore(game.nbaGameId);
  if (!boxScore) {
    console.warn(
      `[worker] halftime.check: could not fetch box score for ${game.nbaGameId}`,
    );
    scheduleNext(leagueId, gameId);
    return;
  }

  // Only run during halftime (period === 2 and game still in progress)
  // or after halftime (period >= 3) for late detection
  if (boxScore.period < 2 || boxScore.gameStatus === 3) {
    console.log(
      `[worker] halftime.check: period=${boxScore.period} gameStatus=${boxScore.gameStatus}, not halftime`,
    );
    return;
  }

  // Build player stats map
  const allPlayers = [
    ...boxScore.homeTeam.players,
    ...boxScore.awayTeam.players,
  ];
  const playerMap = new Map(allPlayers.map((p) => [p.personId, p]));

  // Find picks already with Mozgov windows (don't re-trigger)
  const existingWindowParticipantIds = new Set(
    game.mozgovWindows.map((w) => w.participantId),
  );

  // Check each pick for Mozgov trigger
  const triggeredPicks: Array<{
    pick: (typeof game.picks)[number];
    pickPosition: number;
  }> = [];

  for (const pick of game.picks) {
    if (existingWindowParticipantIds.has(pick.participantId)) continue;

    const playerStats = playerMap.get(pick.nbaPlayerId);
    if (!playerStats) continue;

    if (isMozgovTriggered(playerStats)) {
      triggeredPicks.push({
        pick,
        pickPosition: pick.draftSlot?.pickPosition ?? 0,
      });
    }
  }

  if (triggeredPicks.length === 0) {
    console.log(
      `[worker] halftime.check: no new Mozgov triggers for game ${gameId}`,
    );
    // If there are still active/pending windows, keep polling
    const activeWindows = game.mozgovWindows.filter(
      (w) => w.status === "pending" || w.status === "active",
    );
    if (activeWindows.length > 0) {
      scheduleNext(leagueId, gameId);
    }
    return;
  }

  // Sort by inverse draft order — last pick selects first
  triggeredPicks.sort((a, b) => b.pickPosition - a.pickPosition);

  // Determine order offset from existing windows
  const existingMaxOrder = game.mozgovWindows.reduce(
    (max, w) => Math.max(max, w.order),
    0,
  );

  // Create MozgovWindow records
  for (let i = 0; i < triggeredPicks.length; i++) {
    const { pick } = triggeredPicks[i]!;
    const order = existingMaxOrder + i + 1;

    await db.mozgovWindow.create({
      data: {
        gameId,
        leagueId,
        participantId: pick.participantId,
        originalPickId: pick.id,
        order,
        triggeredBy: "auto",
      },
    });

    // Notify the affected participant
    await enqueueJob("notification.send", {
      userId: pick.participant.userId,
      type: "mozgov-triggered",
      leagueId,
      gameId,
      link: `/league/${leagueId}/game/${gameId}/mozgov`,
    });

    console.log(
      `[worker] halftime.check: Mozgov triggered for participant ${pick.participantId} (order=${order})`,
    );
  }

  // Start the first window's clock if no window is currently active
  const anyActive = game.mozgovWindows.some((w) => w.status === "active");
  if (!anyActive) {
    await startNextMozgovClock(db, gameId, leagueId);
  }

  scheduleNext(leagueId, gameId);
}

function scheduleNext(leagueId: string, gameId: string) {
  void enqueueJob(
    "halftime.check",
    { leagueId, gameId },
    { startAfter: new Date(Date.now() + HALFTIME_POLL_INTERVAL_MS) },
  ).catch((err) =>
    console.error("[worker] halftime.check: reschedule error:", err),
  );
}
