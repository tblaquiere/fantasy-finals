/**
 * Game Router — Stories 3.1, 4.1
 *
 * tRPC procedures for NBA game data, box scores, and scoring.
 * All NBA data flows through nbaStatsService (never inline HTTP calls).
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { enforceLeagueMember } from "~/server/api/helpers";
import { nbaStatsService } from "~/server/services/nba-stats";
import { calculateFantasyPoints } from "~/server/services/scoring";
import { isPlayerEligibleForMozgov } from "~/server/services/eligibility";

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
   * Get eligible replacement players for a Mozgov window — Story 5.3.
   * Filters by: active for tonight, 5+ min in most recent active game,
   * not already used by this participant.
   */
  getMozgovEligiblePlayers: protectedProcedure
    .input(z.object({ gameId: z.string(), windowId: z.string() }))
    .query(async ({ ctx, input }) => {
      const mozgovWindow = await ctx.db.mozgovWindow.findUnique({
        where: { id: input.windowId },
        include: { participant: { select: { id: true, userId: true } } },
      });

      if (!mozgovWindow) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Window not found" });
      }

      // Verify caller owns this window
      if (mozgovWindow.participant.userId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not your window" });
      }

      const game = await ctx.db.game.findUniqueOrThrow({
        where: { id: input.gameId },
      });

      // Get used players for this participant in the series
      const usedPicks = await ctx.db.pick.findMany({
        where: {
          participantId: mozgovWindow.participantId,
          leagueId: mozgovWindow.leagueId,
          confirmed: true,
        },
        select: { nbaPlayerId: true },
      });
      const usedPlayerIds = new Set(usedPicks.map((p) => p.nbaPlayerId));

      // Fetch live box score
      const boxScore = await nbaStatsService.getLiveBoxScore(game.nbaGameId);
      if (!boxScore) return [];

      const allPlayers = [
        ...boxScore.homeTeam.players,
        ...boxScore.awayTeam.players,
      ];

      // Get most recent active minutes from prior games in this league
      const leagueGames = await ctx.db.game.findMany({
        where: { leagueId: mozgovWindow.leagueId },
        orderBy: { gameNumber: "desc" },
        select: { nbaGameId: true, id: true },
      });
      const priorNbaGameIds = leagueGames
        .filter((g) => g.id !== input.gameId)
        .map((g) => g.nbaGameId);

      const priorBoxScores = await ctx.db.boxScore.findMany({
        where: {
          nbaGameId: { in: priorNbaGameIds },
          minutes: { gt: 0 },
        },
        orderBy: { period: "desc" },
        select: { nbaPlayerId: true, minutes: true },
      });

      const recentMinutesMap = new Map<number, number>();
      for (const bs of priorBoxScores) {
        if (!recentMinutesMap.has(bs.nbaPlayerId)) {
          recentMinutesMap.set(bs.nbaPlayerId, bs.minutes);
        }
      }

      // Filter eligible and enrich with current half stats
      return allPlayers
        .filter((p) =>
          isPlayerEligibleForMozgov(
            p,
            usedPlayerIds,
            recentMinutesMap.get(p.personId) ?? null,
          ),
        )
        .map((p) => ({
          personId: p.personId,
          firstName: p.firstName,
          familyName: p.familyName,
          teamTricode: p.teamTricode,
          jerseyNum: p.jerseyNum,
          position: p.position,
          minutes: p.minutes,
          points: p.points,
          rebounds: p.reboundsTotal,
          assists: p.assists,
          steals: p.steals,
          blocks: p.blocks,
          fantasyPoints: calculateFantasyPoints({
            pts: p.points,
            reb: p.reboundsTotal,
            ast: p.assists,
            stl: p.steals,
            blk: p.blocks,
          }),
        }))
        .sort((a, b) => b.fantasyPoints - a.fantasyPoints);
    }),

  /**
   * Get Mozgov window state for a game — Story 5.2.
   * Returns all Mozgov windows with clock info and current active window.
   */
  getMozgovStatus: protectedProcedure
    .input(z.object({ gameId: z.string() }))
    .query(async ({ ctx, input }) => {
      const game = await ctx.db.game.findUnique({
        where: { id: input.gameId },
        select: { id: true, leagueId: true, nbaGameId: true },
      });
      if (!game) return null;

      await enforceLeagueMember(
        ctx.db,
        ctx.session.user.id,
        game.leagueId,
        ctx.session.user.role === "admin",
      );

      const windows = await ctx.db.mozgovWindow.findMany({
        where: { gameId: input.gameId },
        orderBy: { order: "asc" },
        include: {
          participant: {
            include: { user: { select: { id: true, name: true } } },
          },
        },
      });

      // Get original pick player info for each window
      const originalPickIds = windows.map((w) => w.originalPickId);
      const originalPicks = await ctx.db.pick.findMany({
        where: { id: { in: originalPickIds } },
        include: {
          nbaPlayer: {
            select: {
              firstName: true,
              familyName: true,
              teamTricode: true,
            },
          },
        },
      });
      const pickMap = new Map(originalPicks.map((p) => [p.id, p]));

      // Get box scores for original players to show minutes played
      const boxScores = await ctx.db.boxScore.findMany({
        where: {
          nbaGameId: game.nbaGameId,
          nbaPlayerId: {
            in: originalPicks.map((p) => p.nbaPlayerId),
          },
        },
      });
      const boxMap = new Map(boxScores.map((bs) => [bs.nbaPlayerId, bs]));

      const activeWindow = windows.find((w) => w.status === "active") ?? null;
      const currentUserId = ctx.session.user.id;

      return {
        gameId: game.id,
        leagueId: game.leagueId,
        windows: windows.map((w) => {
          const origPick = pickMap.get(w.originalPickId);
          const bs = origPick ? boxMap.get(origPick.nbaPlayerId) : null;
          return {
            id: w.id,
            participantId: w.participantId,
            participantName: w.participant.user.name ?? "Unknown",
            isMe: w.participant.user.id === currentUserId,
            status: w.status,
            order: w.order,
            clockStartsAt: w.clockStartsAt,
            clockExpiresAt: w.clockExpiresAt,
            triggeredBy: w.triggeredBy,
            originalPlayerName: origPick
              ? `${origPick.nbaPlayer.firstName.charAt(0)}. ${origPick.nbaPlayer.familyName}`
              : "Unknown",
            originalPlayerTeam: origPick?.nbaPlayer.teamTricode ?? "",
            originalPlayerMinutes: bs?.minutes ?? 0,
            hasReplacement: !!w.replacementPickId,
          };
        }),
        activeWindowId: activeWindow?.id ?? null,
        isMyTurn:
          activeWindow?.participant.user.id === currentUserId,
      };
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
