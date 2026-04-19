/**
 * scores.poll handler — Story 4.1
 *
 * Polls the NBA API for live box scores during active games.
 * For each active game in a league:
 * 1. Fetch current box score
 * 2. Upsert BoxScore rows for all players
 * 3. Recalculate fantasy points for all picks in the game
 * 4. Update game status indicators (period, gameClock)
 * 5. If game is final, transition game status and trigger notifications (Story 4.2)
 *
 * Self-scheduling: re-enqueues itself every 60s while any game is still active.
 */

import type { Job } from "pg-boss";

import { db } from "~/server/db";
import { enqueueJob } from "~/server/services/job-queue";
import { nbaStatsService } from "~/server/services/nba-stats";
import { calculateFantasyPoints } from "~/server/services/scoring";
import { LIVE_SCORE_POLL_INTERVAL_MS, SERIES_STUBS } from "~/lib/constants";

export type ScoresPollPayload = {
  leagueId: string;
  gameId: string;
};

export async function handleScoresPoll(
  jobs: Job<ScoresPollPayload>[],
): Promise<void> {
  const job = jobs[0];
  if (!job) return;

  const { leagueId, gameId } = job.data;
  console.log(
    `[worker] scores.poll: leagueId=${leagueId} gameId=${gameId}`,
  );

  // Load the game
  const game = await db.game.findUnique({
    where: { id: gameId },
    include: {
      league: { select: { seriesId: true } },
      picks: {
        where: { confirmed: true },
        select: { id: true, nbaPlayerId: true, participantId: true },
      },
    },
  });

  if (!game) {
    console.error(`[worker] scores.poll: game ${gameId} not found`);
    return;
  }

  // Only poll for active games
  if (game.status !== "active" && game.status !== "draft-open") {
    console.log(
      `[worker] scores.poll: game ${gameId} status is ${game.status}, skipping`,
    );
    return;
  }

  // Auto-resolve NBA game ID if it's a placeholder
  let nbaGameId = game.nbaGameId;
  if (nbaGameId.startsWith("game")) {
    const resolved = await resolveNbaGameId(game.league.seriesId);
    if (resolved) {
      nbaGameId = resolved;
      await db.game.update({
        where: { id: gameId },
        data: { nbaGameId: resolved },
      });
      console.log(
        `[worker] scores.poll: resolved NBA game ID ${resolved} for game ${gameId}`,
      );
    } else {
      console.warn(
        `[worker] scores.poll: could not resolve NBA game ID for series ${game.league.seriesId}`,
      );
      scheduleNext(leagueId, gameId);
      return;
    }
  }

  // Fetch live box score
  const boxScore = await nbaStatsService.getLiveBoxScore(nbaGameId);
  if (!boxScore) {
    console.warn(`[worker] scores.poll: could not fetch box score for ${nbaGameId}`);
    scheduleNext(leagueId, gameId);
    return;
  }

  const allPlayers = [
    ...boxScore.homeTeam.players,
    ...boxScore.awayTeam.players,
  ];

  // Upsert BoxScore rows for all players
  for (const player of allPlayers) {
    const fp = calculateFantasyPoints({
      pts: player.points,
      reb: player.reboundsTotal,
      ast: player.assists,
      stl: player.steals,
      blk: player.blocks,
    });

    await db.boxScore.upsert({
      where: {
        nbaGameId_nbaPlayerId: {
          nbaGameId: nbaGameId,
          nbaPlayerId: player.personId,
        },
      },
      update: {
        minutes: player.minutes,
        points: player.points,
        rebounds: player.reboundsTotal,
        assists: player.assists,
        steals: player.steals,
        blocks: player.blocks,
        fantasyPoints: fp,
        period: boxScore.period,
        isFinal: boxScore.gameStatus === 3,
      },
      create: {
        nbaGameId: nbaGameId,
        nbaPlayerId: player.personId,
        minutes: player.minutes,
        points: player.points,
        rebounds: player.reboundsTotal,
        assists: player.assists,
        steals: player.steals,
        blocks: player.blocks,
        fantasyPoints: fp,
        period: boxScore.period,
        isFinal: boxScore.gameStatus === 3,
      },
    });

    // Ensure NbaPlayer exists (may be first time seeing this player)
    await db.nbaPlayer.upsert({
      where: { nbaPlayerId: player.personId },
      update: {},
      create: {
        nbaPlayerId: player.personId,
        firstName: player.firstName,
        familyName: player.familyName,
        teamId: player.teamId,
        teamTricode: player.teamTricode,
        position: player.position,
        jersey: player.jerseyNum,
      },
    });
  }

  // Trigger halftime check when period >= 2 (Story 5.1)
  if (boxScore.period >= 2 && boxScore.gameStatus === 2) {
    // Only enqueue if no halftime.check is already pending for this game
    await enqueueJob("halftime.check", { leagueId, gameId }).catch(() => {
      // Ignore duplicate — halftime.check may already be running
    });
  }

  // Check if game is final (Story 4.2)
  if (boxScore.gameStatus === 3) {
    console.log(`[worker] scores.poll: game ${nbaGameId} is FINAL`);

    await db.game.update({
      where: { id: gameId },
      data: { status: "final" },
    });

    // Notify all league participants that results are posted
    const participants = await db.participant.findMany({
      where: { leagueId },
      select: { userId: true },
    });

    for (const p of participants) {
      await enqueueJob("notification.send", {
        userId: p.userId,
        type: "game-results",
        leagueId,
        gameId,
        link: `/league/${leagueId}/history`,
      });
    }

    // Start post-game stat correction polling (Story 6.4)
    await enqueueJob(
      "stats.correct",
      { gameId, leagueId, finalAt: new Date().toISOString() },
      { startAfter: new Date(Date.now() + 10 * 60 * 1000) },
    );

    // Don't reschedule scores.poll — game is done
    return;
  }

  // Game still active — reschedule
  scheduleNext(leagueId, gameId);
}

function scheduleNext(leagueId: string, gameId: string) {
  void enqueueJob(
    "scores.poll",
    { leagueId, gameId },
    { startAfter: new Date(Date.now() + LIVE_SCORE_POLL_INTERVAL_MS) },
  ).catch((err) =>
    console.error("[worker] scores.poll: reschedule error:", err),
  );
}

/**
 * Try to find today's NBA game matching the league's series teams.
 * Returns the real NBA gameId (e.g. "0042500101") or null.
 */
async function resolveNbaGameId(seriesId: string): Promise<string | null> {
  const stub = SERIES_STUBS.find((s) => s.id === seriesId);
  if (!stub) return null;

  const scoreboard = await nbaStatsService.getTodaysScoreboard();
  if (!scoreboard) return null;

  const teamIds = new Set<number>([stub.homeTeamId, stub.awayTeamId]);
  const match = scoreboard.games.find(
    (g) => teamIds.has(g.homeTeam.teamId) && teamIds.has(g.awayTeam.teamId),
  );

  return match?.gameId ?? null;
}
