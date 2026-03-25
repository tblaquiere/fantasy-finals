/**
 * Game Router — Stories 3.1, 4.1
 *
 * tRPC procedures for NBA game data, box scores, and scoring.
 * All NBA data flows through nbaStatsService (never inline HTTP calls).
 */

import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { enforceLeagueMember } from "~/server/api/helpers";
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

  /**
   * Get live scores for a fantasy game — Story 4.1.
   * Returns each participant's confirmed pick with live fantasy points
   * from the BoxScore table (populated by scores.poll worker).
   * Includes game status indicator (period, isFinal).
   */
  getLiveScores: protectedProcedure
    .input(z.object({ gameId: z.string() }))
    .query(async ({ ctx, input }) => {
      const game = await ctx.db.game.findUnique({
        where: { id: input.gameId },
        include: {
          league: { select: { id: true, name: true } },
          picks: {
            where: { confirmed: true },
            include: {
              participant: {
                include: { user: { select: { name: true } } },
              },
              nbaPlayer: {
                select: {
                  firstName: true,
                  familyName: true,
                  teamTricode: true,
                  jersey: true,
                },
              },
            },
            orderBy: { createdAt: "asc" },
          },
        },
      });

      if (!game) return null;

      await enforceLeagueMember(
        ctx.db,
        ctx.session.user.id,
        game.leagueId,
        ctx.session.user.role === "admin",
      );

      // Fetch box scores for all picked players in this NBA game
      const pickedPlayerIds = game.picks.map((p) => p.nbaPlayerId);
      const boxScores = await ctx.db.boxScore.findMany({
        where: {
          nbaGameId: game.nbaGameId,
          nbaPlayerId: { in: pickedPlayerIds },
        },
      });
      const boxMap = new Map(
        boxScores.map((bs) => [bs.nbaPlayerId, bs]),
      );

      // Determine game status from any box score row
      const anyBox = boxScores[0];
      const period = anyBox?.period ?? 0;
      const isFinal = anyBox?.isFinal ?? false;

      const picks = game.picks.map((pick) => {
        const bs = boxMap.get(pick.nbaPlayerId);
        return {
          id: pick.id,
          participantName:
            pick.participant.user.name ?? "Unknown",
          nbaPlayerId: pick.nbaPlayerId,
          playerFirstName: pick.nbaPlayer.firstName,
          playerFamilyName: pick.nbaPlayer.familyName,
          playerTeamTricode: pick.nbaPlayer.teamTricode,
          playerJersey: pick.nbaPlayer.jersey,
          fantasyPoints: bs?.fantasyPoints ?? 0,
          points: bs?.points ?? 0,
          rebounds: bs?.rebounds ?? 0,
          assists: bs?.assists ?? 0,
          steals: bs?.steals ?? 0,
          blocks: bs?.blocks ?? 0,
          minutes: bs?.minutes ?? 0,
        };
      });

      // Sort by fantasy points descending
      picks.sort((a, b) => b.fantasyPoints - a.fantasyPoints);

      return {
        gameId: game.id,
        gameNumber: game.gameNumber,
        nbaGameId: game.nbaGameId,
        status: game.status,
        leagueId: game.leagueId,
        leagueName: game.league.name,
        period,
        isFinal,
        picks,
      };
    }),
});
