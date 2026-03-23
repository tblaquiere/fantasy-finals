/**
 * Game Router — Story 3.1
 *
 * tRPC procedures for NBA game data, box scores, and scoring.
 * All NBA data flows through nbaStatsService (never inline HTTP calls).
 */

import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { nbaStatsService } from "~/server/services/nba-stats";
import { calculateFantasyPoints } from "~/server/services/scoring";

export const gameRouter = createTRPCRouter({
  /**
   * Get live box score for a specific NBA game.
   * Returns player stats with calculated fantasy points.
   */
  getLiveBoxScore: protectedProcedure
    .input(z.object({ nbaGameId: z.string().regex(/^\d{10}$/, "Invalid NBA game ID format") }))
    .query(async ({ input }) => {
      const boxScore = await nbaStatsService.getLiveBoxScore(input.nbaGameId);
      if (!boxScore) return null;

      // Enrich player stats with fantasy points
      const enrichPlayers = (
        players: typeof boxScore.homeTeam.players,
      ) =>
        players.map((p) => ({
          ...p,
          fantasyPoints: calculateFantasyPoints({
            pts: p.points,
            reb: p.reboundsTotal,
            ast: p.assists,
            stl: p.steals,
            blk: p.blocks,
          }),
        }));

      return {
        ...boxScore,
        homeTeam: {
          ...boxScore.homeTeam,
          players: enrichPlayers(boxScore.homeTeam.players),
        },
        awayTeam: {
          ...boxScore.awayTeam,
          players: enrichPlayers(boxScore.awayTeam.players),
        },
      };
    }),

  /**
   * Get today's NBA games (scoreboard).
   */
  getTodaysGames: protectedProcedure.query(async () => {
    return nbaStatsService.getTodaysScoreboard();
  }),

  /**
   * Get available series for league creation.
   * Returns active/upcoming playoff series from the database.
   */
  getAvailableSeries: protectedProcedure.query(async ({ ctx }) => {
    const series = await ctx.db.nbaSeries.findMany({
      orderBy: { round: "asc" },
    });
    return series;
  }),
});
