/**
 * Standing Router — Stories 6.1, 6.2, 6.3
 *
 * Aggregates fantasy points across games for series leaderboard,
 * per-game stat breakdowns, and burned player visibility.
 */

import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { enforceLeagueMember } from "~/server/api/helpers";
import { ensureSeriesPopulated } from "~/server/services/populate-series";

export const standingRouter = createTRPCRouter({
  /**
   * Get series leaderboard — Story 6.1.
   * Returns participants ranked by cumulative fantasy points across all games.
   * Includes per-game breakdown and live/final indicators.
   */
  getLeaderboard: protectedProcedure
    .input(z.object({ leagueId: z.string() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const isAdmin = ctx.session.user.role === "admin";
      await enforceLeagueMember(ctx.db, userId, input.leagueId, isAdmin);

      // Get all participants
      const participants = await ctx.db.participant.findMany({
        where: { leagueId: input.leagueId },
        include: { user: { select: { id: true, name: true } } },
      });

      // Get all games ordered by game number
      const games = await ctx.db.game.findMany({
        where: { leagueId: input.leagueId },
        orderBy: { gameNumber: "asc" },
        select: {
          id: true,
          gameNumber: true,
          nbaGameId: true,
          status: true,
        },
      });

      // Get all confirmed, non-voided picks for this league
      const picks = await ctx.db.pick.findMany({
        where: {
          leagueId: input.leagueId,
          confirmed: true,
          voidedByMozgov: false,
        },
        select: {
          id: true,
          participantId: true,
          nbaPlayerId: true,
          gameId: true,
          method: true,
        },
      });

      // Get box scores for all picked players across all games
      const nbaGameIds = games.map((g) => g.nbaGameId);
      const pickedPlayerIds = [...new Set(picks.map((p) => p.nbaPlayerId))];
      const boxScores = await ctx.db.boxScore.findMany({
        where: {
          nbaGameId: { in: nbaGameIds },
          nbaPlayerId: { in: pickedPlayerIds },
        },
      });

      // Map: nbaGameId:nbaPlayerId → BoxScore
      const boxMap = new Map(
        boxScores.map((bs) => [`${bs.nbaGameId}:${bs.nbaPlayerId}`, bs]),
      );

      // Map: gameId → nbaGameId
      const gameNbaMap = new Map(games.map((g) => [g.id, g.nbaGameId]));

      // Determine live game status from box scores
      const gameStatusMap = new Map<string, { period: number; isFinal: boolean }>();
      for (const game of games) {
        const gameBoxScores = boxScores.filter(
          (bs) => bs.nbaGameId === game.nbaGameId,
        );
        const anyBox = gameBoxScores[0];
        gameStatusMap.set(game.id, {
          period: anyBox?.period ?? 0,
          isFinal: anyBox?.isFinal ?? false,
        });
      }

      // Build per-participant standings
      const standings = participants.map((participant) => {
        const participantPicks = picks.filter(
          (p) => p.participantId === participant.id,
        );

        let totalFantasyPoints = 0;
        const gameResults: Array<{
          gameId: string;
          gameNumber: number;
          fantasyPoints: number;
          isMozgov: boolean;
        }> = [];

        for (const game of games) {
          const pick = participantPicks.find((p) => p.gameId === game.id);
          if (!pick) {
            gameResults.push({
              gameId: game.id,
              gameNumber: game.gameNumber,
              fantasyPoints: 0,
              isMozgov: false,
            });
            continue;
          }

          const nbaGameId = gameNbaMap.get(game.id);
          const bs = nbaGameId
            ? boxMap.get(`${nbaGameId}:${pick.nbaPlayerId}`)
            : undefined;
          const fp = bs
            ? (bs.correctedFantasyPoints ?? bs.fantasyPoints)
            : 0;

          totalFantasyPoints += fp;
          gameResults.push({
            gameId: game.id,
            gameNumber: game.gameNumber,
            fantasyPoints: fp,
            isMozgov: pick.method.startsWith("mozgov"),
          });
        }

        return {
          participantId: participant.id,
          participantName: participant.user.name ?? "Unknown",
          isMe: participant.user.id === userId,
          totalFantasyPoints,
          gameResults,
        };
      });

      // Sort by total fantasy points descending
      standings.sort((a, b) => b.totalFantasyPoints - a.totalFantasyPoints);

      // Determine if any game is live — poll whenever a game is active
      const hasLiveGame = games.some((g) => g.status === "active");

      return {
        standings,
        games: games.map((g) => ({
          id: g.id,
          gameNumber: g.gameNumber,
          nbaGameId: g.nbaGameId,
          status: g.status,
          period: gameStatusMap.get(g.id)?.period ?? 0,
          isFinal: gameStatusMap.get(g.id)?.isFinal ?? false,
        })),
        hasLiveGame,
      };
    }),

  /**
   * Get per-game stat breakdown — Story 6.2.
   * Returns full stat line for each participant in a specific game,
   * with category leaders highlighted.
   */
  getGameBreakdown: protectedProcedure
    .input(z.object({ leagueId: z.string(), gameId: z.string() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const isAdmin = ctx.session.user.role === "admin";
      await enforceLeagueMember(ctx.db, userId, input.leagueId, isAdmin);

      const game = await ctx.db.game.findUnique({
        where: { id: input.gameId },
        select: { id: true, nbaGameId: true, gameNumber: true, status: true },
      });
      if (!game) return null;

      const picks = await ctx.db.pick.findMany({
        where: {
          gameId: input.gameId,
          confirmed: true,
          voidedByMozgov: false,
        },
        include: {
          participant: {
            include: { user: { select: { id: true, name: true } } },
          },
          nbaPlayer: {
            select: {
              firstName: true,
              familyName: true,
              teamTricode: true,
            },
          },
        },
      });

      // Get box scores for picked players
      const boxScores = await ctx.db.boxScore.findMany({
        where: {
          nbaGameId: game.nbaGameId,
          nbaPlayerId: { in: picks.map((p) => p.nbaPlayerId) },
        },
      });
      const boxMap = new Map(
        boxScores.map((bs) => [bs.nbaPlayerId, bs]),
      );

      const stats = picks.map((pick) => {
        const bs = boxMap.get(pick.nbaPlayerId);
        return {
          participantId: pick.participantId,
          participantName: pick.participant.user.name ?? "Unknown",
          isMe: pick.participant.user.id === userId,
          playerName: `${pick.nbaPlayer.firstName.charAt(0)}. ${pick.nbaPlayer.familyName}`,
          playerTeam: pick.nbaPlayer.teamTricode,
          isMozgov: pick.method.startsWith("mozgov"),
          points: bs?.correctedPoints ?? bs?.points ?? 0,
          rebounds: bs?.correctedRebounds ?? bs?.rebounds ?? 0,
          assists: bs?.correctedAssists ?? bs?.assists ?? 0,
          steals: bs?.correctedSteals ?? bs?.steals ?? 0,
          blocks: bs?.correctedBlocks ?? bs?.blocks ?? 0,
          fantasyPoints: bs?.correctedFantasyPoints ?? bs?.fantasyPoints ?? 0,
          minutes: bs?.minutes ?? 0,
        };
      });

      // Sort by fantasy points descending
      stats.sort((a, b) => b.fantasyPoints - a.fantasyPoints);

      // Compute category leaders
      const categories = ["points", "rebounds", "assists", "steals", "blocks", "fantasyPoints"] as const;
      const leaders: Record<string, string[]> = {};
      for (const cat of categories) {
        const maxVal = Math.max(...stats.map((s) => s[cat]), 0);
        if (maxVal > 0) {
          leaders[cat] = stats
            .filter((s) => s[cat] === maxVal)
            .map((s) => s.participantId);
        }
      }

      return {
        gameNumber: game.gameNumber,
        status: game.status,
        stats,
        leaders,
      };
    }),

  /**
   * Get series-wide category leaders — Story 6.2 enhancement.
   * Aggregates stats across all games per participant and identifies
   * the leader in each statistical category (PTS, REB, AST, STL, BLK, FP).
   */
  getCategoryLeaders: protectedProcedure
    .input(z.object({ leagueId: z.string() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const isAdmin = ctx.session.user.role === "admin";
      await enforceLeagueMember(ctx.db, userId, input.leagueId, isAdmin);

      const participants = await ctx.db.participant.findMany({
        where: { leagueId: input.leagueId },
        include: { user: { select: { id: true, name: true } } },
      });

      const games = await ctx.db.game.findMany({
        where: { leagueId: input.leagueId },
        select: { id: true, nbaGameId: true },
      });

      const picks = await ctx.db.pick.findMany({
        where: {
          leagueId: input.leagueId,
          confirmed: true,
          voidedByMozgov: false,
        },
        select: { participantId: true, nbaPlayerId: true, gameId: true },
      });

      const nbaGameIds = games.map((g) => g.nbaGameId);
      const pickedPlayerIds = [...new Set(picks.map((p) => p.nbaPlayerId))];
      const boxScores = await ctx.db.boxScore.findMany({
        where: {
          nbaGameId: { in: nbaGameIds },
          nbaPlayerId: { in: pickedPlayerIds },
        },
      });

      const boxMap = new Map(
        boxScores.map((bs) => [`${bs.nbaGameId}:${bs.nbaPlayerId}`, bs]),
      );
      const gameNbaMap = new Map(games.map((g) => [g.id, g.nbaGameId]));

      // Accumulate stats per participant across all games
      const totals = new Map<
        string,
        { name: string; isMe: boolean; points: number; rebounds: number; assists: number; steals: number; blocks: number; fantasyPoints: number }
      >();

      for (const p of participants) {
        totals.set(p.id, {
          name: p.user.name ?? "Unknown",
          isMe: p.user.id === userId,
          points: 0,
          rebounds: 0,
          assists: 0,
          steals: 0,
          blocks: 0,
          fantasyPoints: 0,
        });
      }

      for (const pick of picks) {
        const nbaGameId = gameNbaMap.get(pick.gameId);
        if (!nbaGameId) continue;
        const bs = boxMap.get(`${nbaGameId}:${pick.nbaPlayerId}`);
        if (!bs) continue;
        const t = totals.get(pick.participantId);
        if (!t) continue;
        t.points += bs.correctedPoints ?? bs.points;
        t.rebounds += bs.correctedRebounds ?? bs.rebounds;
        t.assists += bs.correctedAssists ?? bs.assists;
        t.steals += bs.correctedSteals ?? bs.steals;
        t.blocks += bs.correctedBlocks ?? bs.blocks;
        t.fantasyPoints += bs.correctedFantasyPoints ?? bs.fantasyPoints;
      }

      const categories = ["points", "rebounds", "assists", "steals", "blocks", "fantasyPoints"] as const;
      type Cat = (typeof categories)[number];

      const leaders: Array<{
        category: Cat;
        label: string;
        participantId: string;
        participantName: string;
        isMe: boolean;
        value: number;
      }> = [];

      const labelMap: Record<Cat, string> = {
        points: "PTS",
        rebounds: "REB",
        assists: "AST",
        steals: "STL",
        blocks: "BLK",
        fantasyPoints: "FP",
      };

      for (const cat of categories) {
        let maxVal = 0;
        let leaderId = "";
        let leaderName = "";
        let leaderIsMe = false;

        for (const [pid, t] of totals) {
          if (t[cat] > maxVal) {
            maxVal = t[cat];
            leaderId = pid;
            leaderName = t.name;
            leaderIsMe = t.isMe;
          }
        }

        if (maxVal > 0) {
          leaders.push({
            category: cat,
            label: labelMap[cat],
            participantId: leaderId,
            participantName: leaderName,
            isMe: leaderIsMe,
            value: maxVal,
          });
        }
      }

      return { leaders };
    }),

  /**
   * Get full series roster with pick history — for roster/players page.
   * Shows all NBA players in the series, which ones the current user has picked,
   * and cumulative stats across games.
   */
  getSeriesRoster: protectedProcedure
    .input(z.object({ leagueId: z.string() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const isAdmin = ctx.session.user.role === "admin";
      await enforceLeagueMember(ctx.db, userId, input.leagueId, isAdmin);

      // Get league to find series teams
      const league = await ctx.db.league.findUnique({
        where: { id: input.leagueId },
        select: { seriesId: true },
      });
      if (!league) return { players: [], myPickedPlayerIds: [] };

      let series = await ctx.db.nbaSeries.findUnique({
        where: { seriesId: league.seriesId },
      });

      // Auto-populate series + roster if missing
      if (!series) {
        await ensureSeriesPopulated(ctx.db, league.seriesId);
        series = await ctx.db.nbaSeries.findUnique({
          where: { seriesId: league.seriesId },
        });
      }
      if (!series) return { players: [], myPickedPlayerIds: [] };

      // Get all players on both teams
      let allPlayers = await ctx.db.nbaPlayer.findMany({
        where: {
          teamId: { in: [series.homeTeamId, series.awayTeamId] },
        },
        orderBy: [{ teamTricode: "asc" }, { familyName: "asc" }],
      });

      // If no players found, try to populate from NBA API
      if (allPlayers.length === 0) {
        await ensureSeriesPopulated(ctx.db, league.seriesId);
        allPlayers = await ctx.db.nbaPlayer.findMany({
          where: {
            teamId: { in: [series.homeTeamId, series.awayTeamId] },
          },
          orderBy: [{ teamTricode: "asc" }, { familyName: "asc" }],
        });
      }

      // Get current user's participant record
      const participant = await ctx.db.participant.findUnique({
        where: { userId_leagueId: { userId, leagueId: input.leagueId } },
      });

      // Get all confirmed, non-voided picks for this league
      const picks = await ctx.db.pick.findMany({
        where: {
          leagueId: input.leagueId,
          confirmed: true,
          voidedByMozgov: false,
        },
        select: {
          participantId: true,
          nbaPlayerId: true,
          gameId: true,
        },
      });

      // Get games for mapping
      const games = await ctx.db.game.findMany({
        where: { leagueId: input.leagueId },
        select: { id: true, nbaGameId: true, gameNumber: true },
        orderBy: { gameNumber: "asc" },
      });
      const gameNbaMap = new Map(games.map((g) => [g.id, g.nbaGameId]));
      const gameNumMap = new Map(games.map((g) => [g.id, g.gameNumber]));

      // Get box scores for aggregating
      const nbaGameIds = games.map((g) => g.nbaGameId);
      const boxScores = await ctx.db.boxScore.findMany({
        where: { nbaGameId: { in: nbaGameIds } },
      });
      const boxMap = new Map(
        boxScores.map((bs) => [`${bs.nbaGameId}:${bs.nbaPlayerId}`, bs]),
      );

      // My picked player ids
      const myPickedPlayerIds = participant
        ? [...new Set(picks.filter((p) => p.participantId === participant.id).map((p) => p.nbaPlayerId))]
        : [];

      // Number of times each player has been picked (by anyone)
      const pickCounts = new Map<number, number>();
      for (const p of picks) {
        pickCounts.set(p.nbaPlayerId, (pickCounts.get(p.nbaPlayerId) ?? 0) + 1);
      }

      // Aggregate stats per player
      const players = allPlayers.map((player) => {
        let totalPoints = 0;
        let totalRebounds = 0;
        let totalAssists = 0;
        let totalSteals = 0;
        let totalBlocks = 0;
        let totalFP = 0;
        let gamesPlayed = 0;

        for (const game of games) {
          const nbaGameId = gameNbaMap.get(game.id);
          if (!nbaGameId) continue;
          const bs = boxMap.get(`${nbaGameId}:${player.nbaPlayerId}`);
          if (bs && bs.minutes > 0) {
            gamesPlayed++;
            totalPoints += bs.correctedPoints ?? bs.points;
            totalRebounds += bs.correctedRebounds ?? bs.rebounds;
            totalAssists += bs.correctedAssists ?? bs.assists;
            totalSteals += bs.correctedSteals ?? bs.steals;
            totalBlocks += bs.correctedBlocks ?? bs.blocks;
            totalFP += bs.correctedFantasyPoints ?? bs.fantasyPoints;
          }
        }

        // Which games this player was picked in (by me)
        const myPickGames = participant
          ? picks
              .filter((p) => p.nbaPlayerId === player.nbaPlayerId && p.participantId === participant.id)
              .map((p) => gameNumMap.get(p.gameId) ?? 0)
          : [];

        return {
          nbaPlayerId: player.nbaPlayerId,
          firstName: player.firstName,
          familyName: player.familyName,
          teamTricode: player.teamTricode,
          position: player.position,
          jersey: player.jersey,
          pickedByMe: myPickedPlayerIds.includes(player.nbaPlayerId),
          myPickGames,
          timesPicked: pickCounts.get(player.nbaPlayerId) ?? 0,
          gamesPlayed,
          totalPoints,
          totalRebounds,
          totalAssists,
          totalSteals,
          totalBlocks,
          totalFP,
        };
      });

      return {
        players,
        myPickedPlayerIds,
        homeTricode: series.homeTricode,
        awayTricode: series.awayTricode,
      };
    }),
});
