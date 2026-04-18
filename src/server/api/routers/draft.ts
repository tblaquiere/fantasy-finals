/**
 * Draft Router — Stories 3.3–3.8
 *
 * Handles draft order generation, retrieval, draft window management,
 * eligible player list, pick submission, draft feed, and preference list.
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";

import {
  createTRPCRouter,
  commissionerProcedure,
  protectedProcedure,
} from "~/server/api/trpc";
import {
  enforceLeagueCommissioner,
  enforceLeagueMember,
} from "~/server/api/helpers";
import { generateAndPersistDraftOrder } from "~/server/services/draft-order";
import {
  advanceClock,
  getDraftStatus,
  openDraftWindow,
  closeDraftWindow,
} from "~/server/services/draft-window";
import { nbaStatsService } from "~/server/services/nba-stats";
import { SERIES_STUBS } from "~/lib/constants";
import { calculateFantasyPoints } from "~/server/services/scoring";
import { isPlayerEligibleForDraft } from "~/server/services/eligibility";
import { enqueueJob } from "~/server/services/job-queue";
import { startNextMozgovClock } from "~/server/services/mozgov-window";

const UNDO_WINDOW_MS = 5_000;

// ── Router ───────────────────────────────────────────────────────

export const draftRouter = createTRPCRouter({
  /**
   * Generate and persist the draft order for a game.
   * Commissioner-only. Idempotent — errors if order already generated.
   *
   * Game 1: random (Fisher-Yates). Game 2+: inverse cumulative score.
   * Fantasy points default to 0 until Pick model exists (Story 3.6).
   */
  generateDraftOrder: commissionerProcedure
    .input(
      z.object({
        leagueId: z.string(),
        nbaGameId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const isAdmin = ctx.session.user.role === "admin";

      await enforceLeagueCommissioner(ctx.db, userId, input.leagueId, isAdmin);

      return generateAndPersistDraftOrder(
        ctx.db,
        input.leagueId,
        input.nbaGameId,
      );
    }),

  /**
   * Get the draft order for a specific game.
   * Any league participant can call this.
   */
  getDraftOrder: protectedProcedure
    .input(
      z.object({
        leagueId: z.string(),
        gameId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const isAdmin = ctx.session.user.role === "admin";

      await enforceLeagueMember(ctx.db, userId, input.leagueId, isAdmin);

      // Verify the game belongs to this league before returning slots
      const game = await ctx.db.game.findFirst({
        where: { id: input.gameId, leagueId: input.leagueId },
      });
      if (!game) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Game not found in this league",
        });
      }

      const slots = await ctx.db.draftSlot.findMany({
        where: { gameId: input.gameId },
        orderBy: { pickPosition: "asc" },
        include: {
          participant: {
            include: {
              user: { select: { id: true, name: true, email: true } },
            },
          },
        },
      });

      if (slots.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Draft order not found for this game",
        });
      }

      // Check which slots have confirmed picks
      const picks = await ctx.db.pick.findMany({
        where: { gameId: input.gameId, confirmed: true },
        select: { participantId: true },
      });
      const pickedParticipants = new Set(picks.map((p) => p.participantId));

      return slots.map((slot) => ({
        id: slot.id,
        pickPosition: slot.pickPosition,
        participantId: slot.participantId,
        userId: slot.participant.userId,
        participantName: slot.participant.user.name,
        participantEmail: slot.participant.user.email,
        clockStartsAt: slot.clockStartsAt,
        clockExpiresAt: slot.clockExpiresAt,
        picked: pickedParticipants.has(slot.participantId),
      }));
    }),

  /**
   * Get draft window status for a game.
   * Returns game status, active slot, clock info, and all slots.
   */
  getDraftStatus: protectedProcedure
    .input(
      z.object({
        leagueId: z.string(),
        gameId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const isAdmin = ctx.session.user.role === "admin";

      await enforceLeagueMember(ctx.db, userId, input.leagueId, isAdmin);

      return getDraftStatus(ctx.db, input.gameId);
    }),

  /**
   * Manually open the draft window (commissioner fallback).
   * Use when the draft.open job fails to fire.
   */
  openDraftWindow: commissionerProcedure
    .input(
      z.object({
        leagueId: z.string(),
        gameId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const isAdmin = ctx.session.user.role === "admin";

      await enforceLeagueCommissioner(ctx.db, userId, input.leagueId, isAdmin);

      await openDraftWindow(ctx.db, input.gameId);
      return { success: true };
    }),

  /**
   * Manually close the draft window (commissioner fallback).
   * Use when tip-off detection hasn't fired yet.
   */
  closeDraftWindow: commissionerProcedure
    .input(
      z.object({
        leagueId: z.string(),
        gameId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const isAdmin = ctx.session.user.role === "admin";

      await enforceLeagueCommissioner(ctx.db, userId, input.leagueId, isAdmin);

      await closeDraftWindow(ctx.db, input.gameId);
      return { success: true };
    }),

  /**
   * Get the draft feed for a game — Story 3.7.
   *
   * Returns all confirmed picks with participant name, player info, pick
   * position number, and auto-assign method label. Also returns the game's
   * draft status so the client knows whether to poll or show static history.
   */
  getFeed: protectedProcedure
    .input(
      z.object({
        leagueId: z.string(),
        gameId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const isAdmin = ctx.session.user.role === "admin";

      await enforceLeagueMember(ctx.db, userId, input.leagueId, isAdmin);

      const game = await ctx.db.game.findFirst({
        where: { id: input.gameId, leagueId: input.leagueId },
      });
      if (!game) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Game not found" });
      }

      const picks = await ctx.db.pick.findMany({
        where: {
          gameId: input.gameId,
          confirmed: true,
        },
        include: {
          draftSlot: { select: { pickPosition: true } },
          participant: {
            include: {
              user: { select: { name: true } },
            },
          },
          nbaPlayer: {
            select: {
              firstName: true,
              familyName: true,
              teamTricode: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
      });

      return {
        status: game.status,
        picks: picks.map((p) => ({
          id: p.id,
          pickPosition: p.draftSlot?.pickPosition ?? 0,
          participantName: p.participant.user.name ?? "Unknown",
          playerFirstName: p.nbaPlayer.firstName,
          playerFamilyName: p.nbaPlayer.familyName,
          playerTeamTricode: p.nbaPlayer.teamTricode,
          method: p.method,
          overridden: p.overridden,
          createdAt: p.createdAt,
        })),
      };
    }),

  /**
   * Submit a pick — Story 3.6.
   *
   * Creates an unconfirmed Pick. The 5-second undo window starts on the client.
   * Clock advances immediately so the next participant isn't blocked.
   * The unique constraint @@unique([leagueId, gameId, nbaPlayerId]) prevents
   * double-drafts at the DB layer.
   */
  submitPick: protectedProcedure
    .input(
      z.object({
        leagueId: z.string(),
        gameId: z.string(),
        nbaPlayerId: z.number(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const isAdmin = ctx.session.user.role === "admin";

      await enforceLeagueMember(ctx.db, userId, input.leagueId, isAdmin);

      // Get participant
      const participant = await ctx.db.participant.findUnique({
        where: { userId_leagueId: { userId, leagueId: input.leagueId } },
      });
      if (!participant) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not a participant" });
      }

      // Find the active draft slot for this participant (clock must be running)
      const now = new Date();
      const activeSlot = await ctx.db.draftSlot.findFirst({
        where: {
          gameId: input.gameId,
          participantId: participant.id,
          clockExpiresAt: { gt: now },
        },
      });
      if (!activeSlot) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "It is not your turn to pick",
        });
      }

      // Check the player hasn't already been picked in this game
      // The unique constraint handles this, but we give a friendlier error
      const existingPick = await ctx.db.pick.findUnique({
        where: {
          leagueId_gameId_nbaPlayerId: {
            leagueId: input.leagueId,
            gameId: input.gameId,
            nbaPlayerId: input.nbaPlayerId,
          },
        },
      });
      if (existingPick) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Player already picked",
        });
      }

      // Create the pick in a transaction
      const pick = await ctx.db.$transaction(async (tx) => {
        const created = await tx.pick.create({
          data: {
            draftSlotId: activeSlot.id,
            nbaPlayerId: input.nbaPlayerId,
            participantId: participant.id,
            gameId: input.gameId,
            leagueId: input.leagueId,
            method: "manual",
            confirmed: false,
          },
        });
        return created;
      });

      // Advance clock to next participant (non-blocking — pick is already saved)
      try {
        await advanceClock(ctx.db, input.gameId, activeSlot.id);
      } catch (err) {
        console.error("[draft] advanceClock error:", err);
      }

      return {
        pickId: pick.id,
        nbaPlayerId: pick.nbaPlayerId,
      };
    }),

  /**
   * Undo a pick within the 5-second window — Story 3.6.
   *
   * Deletes the unconfirmed pick. Does NOT revert clock advancement.
   * The participant must re-pick, but the clock for the next person has
   * already started (they're not blocked).
   */
  undoPick: protectedProcedure
    .input(z.object({ pickId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const pick = await ctx.db.pick.findUnique({
        where: { id: input.pickId },
        include: { participant: { select: { userId: true } } },
      });
      if (!pick) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Pick not found" });
      }
      if (pick.participant.userId !== userId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not your pick" });
      }
      if (pick.confirmed) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Pick already confirmed — cannot undo",
        });
      }

      // Check 5-second window
      const elapsed = Date.now() - pick.createdAt.getTime();
      if (elapsed > UNDO_WINDOW_MS) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Undo window has expired",
        });
      }

      await ctx.db.pick.delete({ where: { id: input.pickId } });
      return { success: true };
    }),

  /**
   * Confirm a pick after undo window expires — Story 3.6.
   *
   * Locks the pick permanently (confirmed=true).
   * Called automatically by the client when the 5-second timer finishes.
   */
  confirmPick: protectedProcedure
    .input(z.object({ pickId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const pick = await ctx.db.pick.findUnique({
        where: { id: input.pickId },
        include: { participant: { select: { userId: true } } },
      });
      if (!pick) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Pick not found" });
      }
      if (pick.participant.userId !== userId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not your pick" });
      }
      if (pick.confirmed) {
        return { success: true }; // idempotent
      }

      await ctx.db.pick.update({
        where: { id: input.pickId },
        data: { confirmed: true },
      });

      return { success: true };
    }),

  /**
   * Override a participant's pick — Story 3.10.
   *
   * Commissioner-only. Replaces the picked player on an existing confirmed pick.
   * Marks the pick as overridden. The old player becomes available again.
   */
  overridePick: commissionerProcedure
    .input(
      z.object({
        leagueId: z.string(),
        pickId: z.string(),
        newNbaPlayerId: z.number(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const isAdmin = ctx.session.user.role === "admin";

      await enforceLeagueCommissioner(ctx.db, userId, input.leagueId, isAdmin);

      const pick = await ctx.db.pick.findUnique({
        where: { id: input.pickId },
      });
      if (!pick) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Pick not found" });
      }
      if (pick.leagueId !== input.leagueId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Pick not in this league" });
      }

      // Check the new player isn't already picked in this game
      const conflict = await ctx.db.pick.findUnique({
        where: {
          leagueId_gameId_nbaPlayerId: {
            leagueId: input.leagueId,
            gameId: pick.gameId,
            nbaPlayerId: input.newNbaPlayerId,
          },
        },
      });
      if (conflict) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Player already picked in this game",
        });
      }

      await ctx.db.pick.update({
        where: { id: input.pickId },
        data: {
          nbaPlayerId: input.newNbaPlayerId,
          overridden: true,
        },
      });

      return { success: true };
    }),

  /**
   * Get eligible player list for the pick screen — Story 3.5.
   *
   * Returns all players from both teams in tonight's game, sorted by series
   * fantasy avg descending. Each player has an eligibility status and stat
   * breakdown. Used players are marked but not hidden (FR11).
   */
  getEligiblePlayers: protectedProcedure
    .input(
      z.object({
        leagueId: z.string(),
        gameId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const isAdmin = ctx.session.user.role === "admin";

      await enforceLeagueMember(ctx.db, userId, input.leagueId, isAdmin);

      // Look up the game to get nbaGameId and league series info
      const game = await ctx.db.game.findFirst({
        where: { id: input.gameId, leagueId: input.leagueId },
        include: { league: true },
      });
      if (!game) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Game not found in this league",
        });
      }

      // Get the participant record for this user in this league
      const participant = await ctx.db.participant.findUnique({
        where: { userId_leagueId: { userId, leagueId: input.leagueId } },
      });
      if (!participant) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not a participant in this league",
        });
      }

      // Try live box score first; fall back to DB roster for pre-game drafts
      const boxScore = await nbaStatsService.getLiveBoxScore(game.nbaGameId);

      // Resolve series metadata for team names
      const seriesStub = SERIES_STUBS.find(
        (s) => s.id === game.league.seriesId,
      );

      let allPlayers: Array<{
        personId: number;
        firstName: string;
        familyName: string;
        jerseyNum: string;
        position: string;
        teamId: number;
        teamTricode: string;
        minutes: number;
        points: number;
        reboundsTotal: number;
        assists: number;
        steals: number;
        blocks: number;
        status: "ACTIVE" | "INACTIVE";
        homeAway: "home" | "away";
        teamName: string;
      }>;

      let teamInfo: {
        homeTeam: { teamTricode: string; teamName: string };
        awayTeam: { teamTricode: string; teamName: string };
        gameStatus: number;
        gameStatusText: string;
      };

      if (boxScore) {
        // Live game data available
        allPlayers = [
          ...boxScore.homeTeam.players.map((p) => ({
            ...p,
            homeAway: "home" as const,
            teamName: boxScore.homeTeam.teamName,
          })),
          ...boxScore.awayTeam.players.map((p) => ({
            ...p,
            homeAway: "away" as const,
            teamName: boxScore.awayTeam.teamName,
          })),
        ];
        teamInfo = {
          homeTeam: {
            teamTricode: boxScore.homeTeam.teamTricode,
            teamName: boxScore.homeTeam.teamName,
          },
          awayTeam: {
            teamTricode: boxScore.awayTeam.teamTricode,
            teamName: boxScore.awayTeam.teamName,
          },
          gameStatus: boxScore.gameStatus,
          gameStatusText: boxScore.gameStatusText,
        };
      } else {
        // Pre-game: use stored roster from NbaPlayer table
        if (!seriesStub) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Series not found for this league",
          });
        }

        const rosterPlayers = await ctx.db.nbaPlayer.findMany({
          where: {
            teamId: { in: [seriesStub.homeTeamId, seriesStub.awayTeamId] },
          },
        });

        if (rosterPlayers.length === 0) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message:
              "No players found for this series. The roster may not have been populated yet.",
          });
        }

        allPlayers = rosterPlayers.map((p) => ({
          personId: p.nbaPlayerId,
          firstName: p.firstName,
          familyName: p.familyName,
          jerseyNum: p.jersey,
          position: p.position,
          teamId: p.teamId,
          teamTricode: p.teamTricode,
          minutes: 0,
          points: 0,
          reboundsTotal: 0,
          assists: 0,
          steals: 0,
          blocks: 0,
          status: "ACTIVE" as const, // all rostered players eligible pre-game
          homeAway:
            p.teamId === seriesStub.homeTeamId
              ? ("home" as const)
              : ("away" as const),
          teamName:
            p.teamId === seriesStub.homeTeamId
              ? seriesStub.homeTeamName
              : seriesStub.awayTeamName,
        }));

        teamInfo = {
          homeTeam: {
            teamTricode: seriesStub.homeTricode,
            teamName: seriesStub.homeTeamName,
          },
          awayTeam: {
            teamTricode: seriesStub.awayTricode,
            teamName: seriesStub.awayTeamName,
          },
          gameStatus: 1, // scheduled
          gameStatusText: "Pre-Game",
        };
      }

      // Get all games for this league to find series game IDs
      const leagueGames = await ctx.db.game.findMany({
        where: { leagueId: input.leagueId },
        select: { nbaGameId: true },
      });
      const seriesNbaGameIds = leagueGames.map((g) => g.nbaGameId);

      // Get this participant's picks across all games in the series (used players)
      const mySeriesPicks = await ctx.db.pick.findMany({
        where: {
          participantId: participant.id,
          leagueId: input.leagueId,
          confirmed: true,
        },
        select: { nbaPlayerId: true },
      });
      const usedPlayerIds = new Set(mySeriesPicks.map((p) => p.nbaPlayerId));

      // Get all confirmed picks in this specific game (double-draft prevention)
      const gamePicksAll = await ctx.db.pick.findMany({
        where: {
          gameId: input.gameId,
          confirmed: true,
        },
        select: { nbaPlayerId: true },
      });
      const pickedPlayerIds = new Set(gamePicksAll.map((p) => p.nbaPlayerId));

      // Get series box score averages for all players
      const nbaPlayerIds = allPlayers.map((p) => p.personId);
      const boxScores = await ctx.db.boxScore.findMany({
        where: {
          nbaPlayerId: { in: nbaPlayerIds },
          nbaGameId: { in: seriesNbaGameIds },
        },
        select: {
          nbaPlayerId: true,
          nbaGameId: true,
          points: true,
          rebounds: true,
          assists: true,
          steals: true,
          blocks: true,
          fantasyPoints: true,
        },
      });

      // Compute per-player: series avg, last game stats
      const playerStatsMap = new Map<
        number,
        {
          seriesAvg: number;
          gamesPlayed: number;
          lastGame: {
            pts: number;
            reb: number;
            ast: number;
            stl: number;
            blk: number;
            fantasyPoints: number;
          } | null;
        }
      >();

      // Group box scores by player
      const byPlayer = new Map<number, typeof boxScores>();
      for (const bs of boxScores) {
        const existing = byPlayer.get(bs.nbaPlayerId) ?? [];
        existing.push(bs);
        byPlayer.set(bs.nbaPlayerId, existing);
      }

      for (const [nbaPlayerId, playerBoxScores] of byPlayer) {
        const totalFp = playerBoxScores.reduce(
          (sum, bs) => sum + bs.fantasyPoints,
          0,
        );
        const gamesPlayed = playerBoxScores.length;
        const seriesAvg = gamesPlayed > 0 ? totalFp / gamesPlayed : 0;

        // Last game = most recent box score that isn't the current game
        const pastGameScores = playerBoxScores.filter(
          (bs) => bs.nbaGameId !== game.nbaGameId,
        );
        const lastGameBs =
          pastGameScores.length > 0
            ? pastGameScores[pastGameScores.length - 1]!
            : null;

        playerStatsMap.set(nbaPlayerId, {
          seriesAvg: Math.round(seriesAvg * 10) / 10,
          gamesPlayed,
          lastGame: lastGameBs
            ? {
                pts: lastGameBs.points,
                reb: lastGameBs.rebounds,
                ast: lastGameBs.assists,
                stl: lastGameBs.steals,
                blk: lastGameBs.blocks,
                fantasyPoints: lastGameBs.fantasyPoints,
              }
            : null,
        });
      }

      // Build the response list
      const players = allPlayers.map((p) => {
        const eligible = isPlayerEligibleForDraft(
          p,
          usedPlayerIds,
          pickedPlayerIds,
        );
        const isUsed = usedPlayerIds.has(p.personId);
        const isPicked = pickedPlayerIds.has(p.personId);
        const stats = playerStatsMap.get(p.personId);

        // Live game fantasy points
        const liveFantasyPoints = calculateFantasyPoints({
          pts: p.points,
          reb: p.reboundsTotal,
          ast: p.assists,
          stl: p.steals,
          blk: p.blocks,
        });

        return {
          nbaPlayerId: p.personId,
          firstName: p.firstName,
          familyName: p.familyName,
          teamTricode: p.teamTricode,
          teamName: p.teamName,
          homeAway: p.homeAway,
          position: p.position,
          jerseyNum: p.jerseyNum,
          eligible,
          isUsed,
          isPicked,
          isActive: p.status === "ACTIVE",
          seriesAvg: stats?.seriesAvg ?? 0,
          gamesPlayed: stats?.gamesPlayed ?? 0,
          lastGame: stats?.lastGame ?? null,
          liveStats: {
            pts: p.points,
            reb: p.reboundsTotal,
            ast: p.assists,
            stl: p.steals,
            blk: p.blocks,
            fantasyPoints: liveFantasyPoints,
          },
        };
      });

      // Sort: eligible first, then by series avg descending
      players.sort((a, b) => {
        if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
        return b.seriesAvg - a.seriesAvg;
      });

      return {
        gameStatus: teamInfo.gameStatus,
        gameStatusText: teamInfo.gameStatusText,
        homeTeam: teamInfo.homeTeam,
        awayTeam: teamInfo.awayTeam,
        players,
      };
    }),

  /**
   * Get my preference list — Story 3.8.
   *
   * Ownership-enforced: only the participant can read their own list (FR19/FR43).
   * Returns items ordered by rank, with player info.
   */
  getPreferenceList: protectedProcedure
    .input(z.object({ leagueId: z.string() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const participant = await ctx.db.participant.findUnique({
        where: { userId_leagueId: { userId, leagueId: input.leagueId } },
      });
      if (!participant) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not a participant" });
      }

      const items = await ctx.db.preferenceListItem.findMany({
        where: {
          participantId: participant.id,
          leagueId: input.leagueId,
        },
        include: {
          nbaPlayer: {
            select: {
              nbaPlayerId: true,
              firstName: true,
              familyName: true,
              teamTricode: true,
              position: true,
            },
          },
        },
        orderBy: { rank: "asc" },
      });

      return items.map((item) => ({
        id: item.id,
        rank: item.rank,
        nbaPlayerId: item.nbaPlayer.nbaPlayerId,
        firstName: item.nbaPlayer.firstName,
        familyName: item.nbaPlayer.familyName,
        teamTricode: item.nbaPlayer.teamTricode,
        position: item.nbaPlayer.position,
      }));
    }),

  /**
   * Save (replace) entire preference list — Story 3.8.
   *
   * Ownership-enforced. Accepts an ordered array of nbaPlayerIds.
   * Deletes existing items and recreates in a single transaction.
   */
  savePreferenceList: protectedProcedure
    .input(
      z.object({
        leagueId: z.string(),
        playerIds: z.array(z.number()),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const participant = await ctx.db.participant.findUnique({
        where: { userId_leagueId: { userId, leagueId: input.leagueId } },
      });
      if (!participant) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not a participant" });
      }

      // Validate: no duplicates
      if (new Set(input.playerIds).size !== input.playerIds.length) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Duplicate players in preference list",
        });
      }

      // Check used players — cannot add players already used in this series
      const usedPicks = await ctx.db.pick.findMany({
        where: {
          participantId: participant.id,
          leagueId: input.leagueId,
          confirmed: true,
        },
        select: { nbaPlayerId: true },
      });
      const usedIds = new Set(usedPicks.map((p) => p.nbaPlayerId));
      const invalidIds = input.playerIds.filter((id) => usedIds.has(id));
      if (invalidIds.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot add already-used players to preference list",
        });
      }

      await ctx.db.$transaction([
        ctx.db.preferenceListItem.deleteMany({
          where: {
            participantId: participant.id,
            leagueId: input.leagueId,
          },
        }),
        ...input.playerIds.map((nbaPlayerId, index) =>
          ctx.db.preferenceListItem.create({
            data: {
              participantId: participant.id,
              leagueId: input.leagueId,
              nbaPlayerId,
              rank: index + 1,
            },
          }),
        ),
      ]);

      return { success: true, count: input.playerIds.length };
    }),

  /**
   * Remove used players from preference list — Story 3.8 (AC3).
   *
   * Called by draft.order-publish job after scores are confirmed.
   * Removes players this participant has used in the series, re-ranks remainder.
   */
  cleanupPreferenceList: protectedProcedure
    .input(z.object({ leagueId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const participant = await ctx.db.participant.findUnique({
        where: { userId_leagueId: { userId, leagueId: input.leagueId } },
      });
      if (!participant) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not a participant" });
      }

      const usedPicks = await ctx.db.pick.findMany({
        where: {
          participantId: participant.id,
          leagueId: input.leagueId,
          confirmed: true,
        },
        select: { nbaPlayerId: true },
      });
      const usedIds = new Set(usedPicks.map((p) => p.nbaPlayerId));

      if (usedIds.size === 0) return { removed: 0 };

      // Get current list in rank order
      const currentItems = await ctx.db.preferenceListItem.findMany({
        where: {
          participantId: participant.id,
          leagueId: input.leagueId,
        },
        orderBy: { rank: "asc" },
      });

      const toDelete = currentItems.filter((item) => usedIds.has(item.nbaPlayerId));
      const toKeep = currentItems.filter((item) => !usedIds.has(item.nbaPlayerId));

      if (toDelete.length === 0) return { removed: 0 };

      await ctx.db.$transaction([
        // Delete used players
        ctx.db.preferenceListItem.deleteMany({
          where: {
            id: { in: toDelete.map((d) => d.id) },
          },
        }),
        // Re-rank remaining items
        ...toKeep.map((item, index) =>
          ctx.db.preferenceListItem.update({
            where: { id: item.id },
            data: { rank: index + 1 },
          }),
        ),
      ]);

      return { removed: toDelete.length };
    }),

  /**
   * Get the full draft history for a league's series — Story 3.12.
   *
   * Returns all games with all confirmed picks, grouped by game.
   * Also returns each participant's burned (used) player list.
   */
  getSeriesHistory: protectedProcedure
    .input(z.object({ leagueId: z.string() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const isAdmin = ctx.session.user.role === "admin";

      await enforceLeagueMember(ctx.db, userId, input.leagueId, isAdmin);

      // Get all games ordered by game number
      const games = await ctx.db.game.findMany({
        where: { leagueId: input.leagueId },
        orderBy: { gameNumber: "asc" },
        include: {
          picks: {
            where: { confirmed: true },
            include: {
              draftSlot: { select: { pickPosition: true } },
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
            orderBy: { createdAt: "asc" },
          },
        },
      });

      // Build burned player list per participant
      const burnedByParticipant = new Map<
        string,
        { participantName: string; players: { firstName: string; familyName: string; teamTricode: string }[] }
      >();

      for (const game of games) {
        for (const pick of game.picks) {
          const key = pick.participantId;
          if (!burnedByParticipant.has(key)) {
            burnedByParticipant.set(key, {
              participantName: pick.participant.user.name ?? "Unknown",
              players: [],
            });
          }
          burnedByParticipant.get(key)!.players.push({
            firstName: pick.nbaPlayer.firstName,
            familyName: pick.nbaPlayer.familyName,
            teamTricode: pick.nbaPlayer.teamTricode,
          });
        }
      }

      return {
        games: games.map((game) => ({
          id: game.id,
          gameNumber: game.gameNumber,
          status: game.status,
          picks: game.picks.map((p) => ({
            id: p.id,
            pickPosition: p.draftSlot?.pickPosition ?? 0,
            participantName: p.participant.user.name ?? "Unknown",
            participantUserId: p.participant.user.id,
            playerFirstName: p.nbaPlayer.firstName,
            playerFamilyName: p.nbaPlayer.familyName,
            playerTeamTricode: p.nbaPlayer.teamTricode,
            method: p.method,
            overridden: p.overridden,
          })),
        })),
        burnedPlayers: Array.from(burnedByParticipant.entries()).map(
          ([, value]) => value,
        ),
      };
    }),

  /**
   * Commissioner manual Mozgov trigger — Story 5.1.
   * Opens a Mozgov replacement window for a specific participant's pick.
   */
  triggerMozgov: commissionerProcedure
    .input(
      z.object({
        leagueId: z.string(),
        gameId: z.string(),
        pickId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { leagueId, gameId, pickId } = input;
      await enforceLeagueCommissioner(
        ctx.db,
        ctx.session.user.id,
        leagueId,
        ctx.session.user.role === "admin",
      );

      const pick = await ctx.db.pick.findUnique({
        where: { id: pickId },
        include: {
          participant: { select: { id: true, userId: true } },
          draftSlot: { select: { pickPosition: true } },
        },
      });

      if (!pick || pick.gameId !== gameId || pick.leagueId !== leagueId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Pick not found in this game",
        });
      }

      if (pick.voidedByMozgov) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Pick already voided by Mozgov",
        });
      }

      // Check if window already exists
      const existing = await ctx.db.mozgovWindow.findUnique({
        where: {
          gameId_participantId: {
            gameId,
            participantId: pick.participantId,
          },
        },
      });

      if (existing) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Mozgov window already exists for this participant",
        });
      }

      // Find max order across existing windows
      const maxOrderWindow = await ctx.db.mozgovWindow.findFirst({
        where: { gameId },
        orderBy: { order: "desc" },
        select: { order: true },
      });
      const order = (maxOrderWindow?.order ?? 0) + 1;

      await ctx.db.mozgovWindow.create({
        data: {
          gameId,
          leagueId,
          participantId: pick.participantId,
          originalPickId: pickId,
          order,
          triggeredBy: "commissioner",
        },
      });

      // Notify the participant
      await enqueueJob("notification.send", {
        userId: pick.participant.userId,
        type: "mozgov-triggered",
        leagueId,
        gameId,
        link: `/league/${leagueId}/game/${gameId}/mozgov`,
      });

      // Start clock if no window currently active
      const anyActive = await ctx.db.mozgovWindow.findFirst({
        where: { gameId, status: "active" },
      });
      if (!anyActive) {
        await startNextMozgovClock(ctx.db, gameId, leagueId);
      }

      return { ok: true };
    }),

  /**
   * Submit a Mozgov replacement pick — Story 5.2.
   * Replaces the original player, voids the original pick,
   * and advances to the next Mozgov window.
   */
  submitMozgovReplacement: protectedProcedure
    .input(
      z.object({
        windowId: z.string(),
        nbaPlayerId: z.number(),
        leagueId: z.string(),
        gameId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { windowId, nbaPlayerId, leagueId, gameId } = input;

      const mozgovWindow = await ctx.db.mozgovWindow.findUnique({
        where: { id: windowId },
        include: { participant: { select: { id: true, userId: true } } },
      });

      if (!mozgovWindow) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Mozgov window not found",
        });
      }

      if (mozgovWindow.status !== "active") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Mozgov window is not active",
        });
      }

      // Verify caller owns this window
      const participant = await ctx.db.participant.findUnique({
        where: { userId_leagueId: { userId: ctx.session.user.id, leagueId } },
      });

      if (participant?.id !== mozgovWindow.participantId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not your Mozgov window",
        });
      }

      // Create replacement pick
      const replacementPick = await ctx.db.pick.create({
        data: {
          nbaPlayerId,
          participantId: mozgovWindow.participantId,
          gameId,
          leagueId,
          method: "mozgov-manual",
          confirmed: true,
        },
      });

      // Void original and complete window in transaction
      await ctx.db.$transaction([
        ctx.db.pick.update({
          where: { id: mozgovWindow.originalPickId },
          data: { voidedByMozgov: true, confirmed: false },
        }),
        ctx.db.mozgovWindow.update({
          where: { id: windowId },
          data: {
            status: "completed",
            replacementPickId: replacementPick.id,
          },
        }),
      ]);

      // Advance to next Mozgov window
      await startNextMozgovClock(ctx.db, gameId, leagueId);

      return { ok: true, pickId: replacementPick.id };
    }),
});
