/**
 * stats.correct handler — Story 6.4
 *
 * Polls for post-game stat corrections after a game is marked final.
 * Runs every 10 minutes for 24 hours after the final buzzer.
 * Compares current NBA stats with stored values and applies corrections.
 * Preserves original stats for audit — corrections stored in separate fields.
 */

import type { Job } from "pg-boss";

import { db } from "~/server/db";
import { enqueueJob } from "~/server/services/job-queue";
import { nbaStatsService } from "~/server/services/nba-stats";
import { calculateFantasyPoints } from "~/server/services/scoring";
import { regenerateProvisionalIfChanged } from "~/server/services/draft-order";

export type StatsCorrectPayload = {
  gameId: string;
  leagueId: string;
  finalAt: string; // ISO timestamp of when game was marked final
};

const CORRECTION_POLL_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const CORRECTION_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function handleStatsCorrect(
  jobs: Job<StatsCorrectPayload>[],
): Promise<void> {
  const job = jobs[0];
  if (!job) return;

  const { gameId, leagueId, finalAt } = job.data;
  console.log(
    `[worker] stats.correct: gameId=${gameId} leagueId=${leagueId}`,
  );

  // Check if correction window has expired (24h after final)
  const finalTime = new Date(finalAt).getTime();
  if (Date.now() - finalTime > CORRECTION_WINDOW_MS) {
    console.log(
      `[worker] stats.correct: correction window expired for game ${gameId}`,
    );
    return;
  }

  // Load the game
  const game = await db.game.findUnique({
    where: { id: gameId },
    select: { nbaGameId: true, status: true },
  });

  if (game?.status !== "final") {
    console.log(
      `[worker] stats.correct: game ${gameId} not final, skipping`,
    );
    return;
  }

  // Fetch latest box score from NBA
  const boxScore = await nbaStatsService.getLiveBoxScore(game.nbaGameId);
  if (!boxScore) {
    console.warn(
      `[worker] stats.correct: could not fetch box score for ${game.nbaGameId}`,
    );
    scheduleNext(gameId, leagueId, finalAt);
    return;
  }

  const allPlayers = [
    ...boxScore.homeTeam.players,
    ...boxScore.awayTeam.players,
  ];

  // Load stored box scores for this game
  const storedBoxScores = await db.boxScore.findMany({
    where: { nbaGameId: game.nbaGameId },
  });

  let correctionCount = 0;

  for (const stored of storedBoxScores) {
    const latest = allPlayers.find(
      (p) => p.personId === stored.nbaPlayerId,
    );
    if (!latest) continue;

    // Compare current official stats with what we stored
    const currentPts = stored.correctedPoints ?? stored.points;
    const currentReb = stored.correctedRebounds ?? stored.rebounds;
    const currentAst = stored.correctedAssists ?? stored.assists;
    const currentStl = stored.correctedSteals ?? stored.steals;
    const currentBlk = stored.correctedBlocks ?? stored.blocks;

    const hasDiff =
      latest.points !== currentPts ||
      latest.reboundsTotal !== currentReb ||
      latest.assists !== currentAst ||
      latest.steals !== currentStl ||
      latest.blocks !== currentBlk;

    if (!hasDiff) continue;

    // Apply correction — store in corrected fields, preserve originals
    const correctedFP = calculateFantasyPoints({
      pts: latest.points,
      reb: latest.reboundsTotal,
      ast: latest.assists,
      stl: latest.steals,
      blk: latest.blocks,
    });

    await db.boxScore.update({
      where: { id: stored.id },
      data: {
        correctedPoints: latest.points,
        correctedRebounds: latest.reboundsTotal,
        correctedAssists: latest.assists,
        correctedSteals: latest.steals,
        correctedBlocks: latest.blocks,
        correctedFantasyPoints: correctedFP,
      },
    });

    correctionCount++;
    console.log(
      `[worker] stats.correct: corrected player ${stored.nbaPlayerId} in game ${game.nbaGameId}`,
    );
  }

  if (correctionCount > 0) {
    console.log(
      `[worker] stats.correct: ${correctionCount} correction(s) applied for game ${gameId}`,
    );

    // Story 7.4: stat correction may have shifted standings — regenerate the next
    // game's provisional draft order and notify participants whose position changed.
    // Skipped automatically if next game's draft window has opened (provisional flipped off).
    try {
      const result = await regenerateProvisionalIfChanged(db, leagueId);
      if (result && result.changedParticipantIds.length > 0) {
        const changed = await db.participant.findMany({
          where: { id: { in: result.changedParticipantIds } },
          select: { userId: true },
        });
        for (const p of changed) {
          await enqueueJob("notification.send", {
            userId: p.userId,
            type: "draft-order-updated",
            leagueId,
            gameId: result.gameId,
            link: `/league/${leagueId}`,
          });
        }
        console.log(
          `[worker] stats.correct: provisional draft order regenerated, ${result.changedParticipantIds.length} participant(s) notified`,
        );
      }
    } catch (err) {
      console.error("[worker] stats.correct: regenerateProvisionalIfChanged failed:", err);
    }
  }

  // Reschedule for next check
  scheduleNext(gameId, leagueId, finalAt);
}

function scheduleNext(
  gameId: string,
  leagueId: string,
  finalAt: string,
) {
  void enqueueJob(
    "stats.correct",
    { gameId, leagueId, finalAt },
    { startAfter: new Date(Date.now() + CORRECTION_POLL_INTERVAL_MS) },
  ).catch((err) =>
    console.error("[worker] stats.correct: reschedule error:", err),
  );
}
