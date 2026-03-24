/**
 * Draft Router — Stories 3.3, 3.4
 *
 * Handles draft order generation, retrieval, and draft window management.
 * Pick submission and auto-assign are later stories.
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
  getDraftStatus,
  openDraftWindow,
  closeDraftWindow,
} from "~/server/services/draft-window";

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
        clockStartsAt: slot.clockStartsAt,
        clockExpiresAt: slot.clockExpiresAt,
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
});
