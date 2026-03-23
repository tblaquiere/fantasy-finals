/**
 * Draft Router — Story 3.3
 *
 * Handles draft order generation and retrieval.
 * Pick submission, clocks, and auto-assign are later stories.
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
import {
  calcDraftOrder,
  type ParticipantStanding,
} from "~/server/services/draft-order";

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

      // Load all participants for the league
      const participants = await ctx.db.participant.findMany({
        where: { leagueId: input.leagueId },
        orderBy: { joinedAt: "asc" },
      });

      if (participants.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "League has no participants",
        });
      }

      const participantIds = participants.map((p) => p.id);

      // All reads and writes inside transaction to prevent race conditions
      const game = await ctx.db.$transaction(async (tx) => {
        // Idempotency guard — fail if game already exists for this nbaGameId
        const existing = await tx.game.findUnique({
          where: {
            leagueId_nbaGameId: {
              leagueId: input.leagueId,
              nbaGameId: input.nbaGameId,
            },
          },
        });
        if (existing) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Draft order already generated for this game",
          });
        }

        // Determine game number inside transaction to prevent duplicates
        const existingGameCount = await tx.game.count({
          where: { leagueId: input.leagueId },
        });
        const gameNumber = existingGameCount + 1;

        // Build standings for Game 2+ using prior DraftSlot pick positions.
        // Fantasy points are 0 until Pick model exists (Story 3.6).
        let standings: ParticipantStanding[] | undefined;

        if (gameNumber > 1) {
          const priorGame = await tx.game.findFirst({
            where: { leagueId: input.leagueId },
            orderBy: { gameNumber: "desc" },
            include: { draftSlots: true },
          });

          standings = participants.map((p) => {
            const slot = priorGame?.draftSlots.find(
              (ds) => ds.participantId === p.id,
            );
            return {
              participantId: p.id,
              cumulativeFantasyPoints: 0, // populated in Story 3.6+ when Pick model exists
              priorGamePickPosition: slot?.pickPosition ?? null,
            };
          });
        }

        const orderedIds = calcDraftOrder(participantIds, standings);

        const created = await tx.game.create({
          data: {
            leagueId: input.leagueId,
            nbaGameId: input.nbaGameId,
            gameNumber,
          },
        });

        await tx.draftSlot.createMany({
          data: orderedIds.map((participantId, idx) => ({
            gameId: created.id,
            participantId,
            pickPosition: idx + 1,
          })),
        });

        return created;
      });

      return { gameId: game.id, gameNumber: game.gameNumber };
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
              user: { select: { id: true, name: true } },
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

      return slots.map((slot) => ({
        pickPosition: slot.pickPosition,
        participantId: slot.participantId,
        userId: slot.participant.userId,
        name: slot.participant.user.name ?? "Unknown",
      }));
    }),
});
