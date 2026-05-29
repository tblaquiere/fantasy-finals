import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createTRPCRouter, adminProcedure, commissionerProcedure, protectedProcedure, publicProcedure } from "~/server/api/trpc";
import { enforceLeagueCommissioner } from "~/server/api/helpers";
import { CLOCK_DURATION_OPTIONS } from "~/lib/constants";
import { ensureSeriesPopulated } from "~/server/services/populate-series";
import { getPlayoffSeries } from "~/server/services/playoff-series";
import {
  validateOffset,
  rescheduleAllPendingGames,
  revalidateOffsetsForLeague,
} from "~/server/services/draft-open-schedule";

const validClockMinutes = new Set<number>(CLOCK_DURATION_OPTIONS);

export const leagueRouter = createTRPCRouter({
  getAllLeagues: adminProcedure
    .query(async ({ ctx }) => {
      const leagues = await ctx.db.league.findMany({
        where: { deletedAt: null },
        select: {
          id: true,
          name: true,
          seriesId: true,
          seriesName: true,
          createdAt: true,
          participants: {
            where: { isCommissioner: true },
            include: {
              user: { select: { id: true, name: true, email: true } },
            },
            take: 1,
          },
          _count: { select: { participants: true } },
        },
        orderBy: { createdAt: "desc" },
      });

      return leagues.map((league) => {
        const commParticipant = league.participants[0];
        return {
          leagueId: league.id,
          leagueName: league.name,
          seriesId: league.seriesId,
          seriesName: league.seriesName ?? league.seriesId,
          participantCount: league._count.participants,
          commissioner: commParticipant
            ? {
                userId: commParticipant.user.id,
                name: commParticipant.user.name,
                email: commParticipant.user.email,
              }
            : null,
        };
      });
    }),

  getMyLeagues: protectedProcedure
    .query(async ({ ctx }) => {
      const userId = ctx.session.user.id;
      const participations = await ctx.db.participant.findMany({
        where: { userId, league: { deletedAt: null } },
        include: {
          league: {
            include: {
              _count: { select: { participants: true } },
            },
          },
        },
        orderBy: { joinedAt: "asc" },
      });
      return participations.map((p) => ({
        leagueId: p.leagueId,
        leagueName: p.league.name,
        seriesId: p.league.seriesId,
        seriesName: p.league.seriesName ?? p.league.seriesId,
        participantCount: p.league._count.participants,
        isCommissioner: p.isCommissioner,
        joinedAt: p.joinedAt,
      }));
    }),

  createLeague: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(60),
        seriesId: z.string().min(1),
        clockDurationMinutes: z.number().int().refine(
          (v) => validClockMinutes.has(v),
          { message: `Must be one of: ${[...CLOCK_DURATION_OPTIONS].join(", ")}` },
        ),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Validate seriesId against the schedule-derived catalog. Rejects
      // arbitrary strings that aren't a currently-known playoff series.
      const series = await getPlayoffSeries(ctx.db, input.seriesId);
      if (!series) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Unknown playoff series",
        });
      }

      // Wrap all writes in a transaction for atomicity
      const league = await ctx.db.$transaction(async (tx) => {
        const created = await tx.league.create({
          data: {
            name: input.name,
            seriesId: input.seriesId,
            seriesName: series.name,
            clockDurationMinutes: input.clockDurationMinutes,
            inviteToken: crypto.randomUUID(),
            createdById: userId,
            participants: {
              create: {
                userId,
                isCommissioner: true,
              },
            },
          },
        });

        // Promote user to commissioner role if currently participant
        // Note: JWT role is stale until next sign-in — acceptable for MVP
        if (ctx.session.user.role === "participant") {
          await tx.user.update({
            where: { id: userId },
            data: { role: "commissioner" },
          });
        }

        return created;
      });

      // Populate NbaSeries + NbaPlayer records (non-blocking — don't fail league creation)
      void ensureSeriesPopulated(ctx.db, input.seriesId).catch((err) =>
        console.error("[createLeague] ensureSeriesPopulated error:", err),
      );

      return { leagueId: league.id };
    }),

  getLeague: protectedProcedure
    .input(z.object({ leagueId: z.string() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const isAdmin = ctx.session.user.role === "admin";

      // Admins bypass member check
      if (!isAdmin) {
        const membership = await ctx.db.participant.findUnique({
          where: { userId_leagueId: { userId, leagueId: input.leagueId } },
        });
        if (!membership) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Not a member of this league" });
        }
      }

      const league = await ctx.db.league.findFirst({
        where: { id: input.leagueId, deletedAt: null },
        include: {
          participants: {
            include: { user: { select: { id: true, name: true, email: true } } },
            orderBy: { joinedAt: "asc" },
          },
        },
      });

      if (!league) {
        throw new TRPCError({ code: "NOT_FOUND", message: "League not found" });
      }

      return league;
    }),

  getInviteToken: commissionerProcedure
    .input(z.object({ leagueId: z.string() }))
    .query(async ({ ctx, input }) => {
      await enforceLeagueCommissioner(
        ctx.db, ctx.session.user.id, input.leagueId, ctx.session.user.role === "admin",
      );

      const league = await ctx.db.league.findFirst({
        where: { id: input.leagueId, deletedAt: null },
        select: { inviteToken: true },
      });

      if (!league) {
        throw new TRPCError({ code: "NOT_FOUND", message: "League not found" });
      }

      return { token: league.inviteToken };
    }),

  getLeagueByToken: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ ctx, input }) => {
      const league = await ctx.db.league.findFirst({
        where: { inviteToken: input.token, deletedAt: null },
        select: {
          name: true,
          seriesId: true,
          seriesName: true,
          _count: { select: { participants: true } },
        },
      });

      if (!league) return null;

      return {
        name: league.name,
        seriesId: league.seriesId,
        seriesName: league.seriesName ?? league.seriesId,
        participantCount: league._count.participants,
      };
    }),

  joinLeague: protectedProcedure
    .input(z.object({ token: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const league = await ctx.db.league.findFirst({
        where: { inviteToken: input.token, deletedAt: null },
        select: { id: true },
      });

      if (!league) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invalid or expired invite link" });
      }

      try {
        await ctx.db.participant.create({
          data: {
            userId: ctx.session.user.id,
            leagueId: league.id,
            isCommissioner: false,
          },
        });
        // Story 7.1: a new participant tightens the minimum-legal offset.
        // Bump any pending games that now violate the rule. Fire-and-forget so
        // the join response isn't blocked on a multi-game recompute; tag the
        // failure log with [CRITICAL] for alerting since pending games will be
        // mis-scheduled until the next reconcile pass picks up the drift.
        void revalidateOffsetsForLeague(ctx.db, league.id).catch((err) =>
          console.error(
            `[CRITICAL][joinLeague] revalidateOffsetsForLeague failed for leagueId=${league.id} userId=${ctx.session.user.id}; pending games may be mis-scheduled until next reconcile pass`,
            err,
          ),
        );
        return { leagueId: league.id, alreadyMember: false };
      } catch (err) {
        if (
          typeof err === "object" && err !== null && "code" in err && err.code === "P2002"
        ) {
          return { leagueId: league.id, alreadyMember: true };
        }
        throw err;
      }
    }),

  /**
   * Story 7.1 — Participant leaves a league. Commissioner cannot leave
   * (must delegate first). After deletion, runs revalidateOffsetsForLeague
   * even though leaving lowers the participant count — the helper is
   * idempotent and only acts when violations exist.
   */
  leaveLeague: protectedProcedure
    .input(z.object({ leagueId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const participant = await ctx.db.participant.findUnique({
        where: { userId_leagueId: { userId, leagueId: input.leagueId } },
      });
      if (!participant) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Not a member of this league" });
      }
      if (participant.isCommissioner) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Commissioner cannot leave — delegate to another participant first",
        });
      }
      await ctx.db.participant.delete({
        where: { userId_leagueId: { userId, leagueId: input.leagueId } },
      });
      void revalidateOffsetsForLeague(ctx.db, input.leagueId).catch((err) =>
        console.error(
          `[CRITICAL][leaveLeague] revalidateOffsetsForLeague failed for leagueId=${input.leagueId} userId=${userId}; pending games may be mis-scheduled until next reconcile pass`,
          err,
        ),
      );
      return { success: true };
    }),

  delegateCommissioner: commissionerProcedure
    .input(z.object({ leagueId: z.string(), newCommissionerId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const isAdmin = ctx.session.user.role === "admin";
      await enforceLeagueCommissioner(ctx.db, ctx.session.user.id, input.leagueId, isAdmin);

      // Verify target is a participant of this league
      const targetParticipant = await ctx.db.participant.findUnique({
        where: { userId_leagueId: { userId: input.newCommissionerId, leagueId: input.leagueId } },
      });
      if (!targetParticipant) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Target user is not a participant of this league" });
      }
      if (targetParticipant.isCommissioner) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "User is already the commissioner" });
      }

      await ctx.db.$transaction(async (tx) => {
        // Flip isCommissioner on both participant records
        await tx.participant.update({
          where: { userId_leagueId: { userId: input.newCommissionerId, leagueId: input.leagueId } },
          data: { isCommissioner: true },
        });
        await tx.participant.update({
          where: { userId_leagueId: { userId: ctx.session.user.id, leagueId: input.leagueId } },
          data: { isCommissioner: false },
        });

        // Promote new commissioner's User.role in DB
        await tx.user.update({
          where: { id: input.newCommissionerId },
          data: { role: "commissioner" },
        });

        // Demote old commissioner's User.role only if they have no other commissioner roles
        const remainingCommissionerRoles = await tx.participant.count({
          where: {
            userId: ctx.session.user.id,
            isCommissioner: true,
            leagueId: { not: input.leagueId },
          },
        });
        if (remainingCommissionerRoles === 0) {
          await tx.user.update({
            where: { id: ctx.session.user.id },
            data: { role: "participant" },
          });
        }
      });

      return { success: true };
    }),

  /**
   * Story 7.1 — Update the league-level default draft-open offset (minutes before tipoff).
   * Validates the new value against the participants × clock + buffer rule;
   * if accepted, recomputes draftOpensAt for every pending game that uses the
   * default and replaces their queued draft.open jobs.
   */
  updateDraftOpenOffset: commissionerProcedure
    .input(
      z.object({
        leagueId: z.string(),
        draftOpenOffsetMinutes: z.number().int().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const isAdmin = ctx.session.user.role === "admin";
      await enforceLeagueCommissioner(
        ctx.db, ctx.session.user.id, input.leagueId, isAdmin,
      );

      // Validate + write inside a single transaction so a concurrent join
      // can't change the participant count between the read and the write.
      // A participant joining AFTER this completes is handled by joinLeague's
      // call to revalidateOffsetsForLeague.
      await ctx.db.$transaction(async (tx) => {
        const league = await tx.league.findFirst({
          where: { id: input.leagueId, deletedAt: null },
          select: {
            id: true,
            clockDurationMinutes: true,
            _count: { select: { participants: true } },
          },
        });
        if (!league) {
          throw new TRPCError({ code: "NOT_FOUND", message: "League not found" });
        }

        const validation = validateOffset(
          league._count.participants,
          league.clockDurationMinutes,
          input.draftOpenOffsetMinutes,
        );
        if (!validation.ok) {
          throw new TRPCError({ code: "BAD_REQUEST", message: validation.message });
        }

        await tx.league.update({
          where: { id: input.leagueId },
          data: { draftOpenOffsetMinutes: input.draftOpenOffsetMinutes },
        });
      });

      await rescheduleAllPendingGames(ctx.db, input.leagueId);

      return { success: true };
    }),

  regenerateInviteToken: commissionerProcedure
    .input(z.object({ leagueId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await enforceLeagueCommissioner(
        ctx.db, ctx.session.user.id, input.leagueId, ctx.session.user.role === "admin",
      );

      // Verify league exists before updating
      const existing = await ctx.db.league.findFirst({
        where: { id: input.leagueId, deletedAt: null },
        select: { id: true },
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "League not found" });
      }

      const newToken = crypto.randomUUID();
      await ctx.db.league.update({
        where: { id: input.leagueId },
        data: { inviteToken: newToken },
      });

      return { token: newToken };
    }),

  // ── Story 7.5: Soft-delete + restore + permanent delete ──────────────

  /** Returns the caller's soft-deleted leagues where they are commissioner. */
  getMyDeletedLeagues: protectedProcedure
    .query(async ({ ctx }) => {
      const userId = ctx.session.user.id;
      const participations = await ctx.db.participant.findMany({
        where: {
          userId,
          isCommissioner: true,
          league: { deletedAt: { not: null } },
        },
        include: {
          league: { select: { id: true, name: true, seriesId: true, seriesName: true, deletedAt: true } },
        },
      });
      return participations.map((p) => ({
        leagueId: p.league.id,
        leagueName: p.league.name,
        seriesId: p.league.seriesId,
        seriesName: p.league.seriesName ?? p.league.seriesId,
        deletedAt: p.league.deletedAt!,
      }));
    }),

  softDeleteLeague: commissionerProcedure
    .input(z.object({ leagueId: z.string(), confirmationName: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const isAdmin = ctx.session.user.role === "admin";
      await enforceLeagueCommissioner(ctx.db, ctx.session.user.id, input.leagueId, isAdmin);

      const league = await ctx.db.league.findFirst({
        where: { id: input.leagueId, deletedAt: null },
        select: { id: true, name: true },
      });
      if (!league) {
        throw new TRPCError({ code: "NOT_FOUND", message: "League not found" });
      }
      if (input.confirmationName.trim() !== league.name) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Confirmation name does not match league name",
        });
      }

      await ctx.db.league.update({
        where: { id: input.leagueId },
        data: { deletedAt: new Date() },
      });
      return { success: true };
    }),

  restoreLeague: commissionerProcedure
    .input(z.object({ leagueId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const isAdmin = ctx.session.user.role === "admin";
      await enforceLeagueCommissioner(
        ctx.db, ctx.session.user.id, input.leagueId, isAdmin, { allowDeleted: true },
      );

      const league = await ctx.db.league.findUnique({
        where: { id: input.leagueId },
        select: { id: true, deletedAt: true },
      });
      if (!league) {
        throw new TRPCError({ code: "NOT_FOUND", message: "League not found" });
      }
      if (league.deletedAt === null) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "League is not deleted" });
      }

      await ctx.db.league.update({
        where: { id: input.leagueId },
        data: { deletedAt: null },
      });
      return { success: true };
    }),

  permanentlyDeleteLeague: commissionerProcedure
    .input(z.object({ leagueId: z.string(), confirmationName: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const isAdmin = ctx.session.user.role === "admin";
      await enforceLeagueCommissioner(
        ctx.db, ctx.session.user.id, input.leagueId, isAdmin, { allowDeleted: true },
      );

      const league = await ctx.db.league.findUnique({
        where: { id: input.leagueId },
        select: { id: true, name: true, deletedAt: true },
      });
      if (!league) {
        throw new TRPCError({ code: "NOT_FOUND", message: "League not found" });
      }
      if (league.deletedAt === null) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "League must be soft-deleted before permanent deletion",
        });
      }
      if (input.confirmationName.trim() !== league.name) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Confirmation name does not match league name",
        });
      }

      // Cascade order: child records that don't auto-cascade from League FK first.
      // Picks → MozgovWindows → DraftSlots → Games → League (Participants + PreferenceListItems cascade).
      await ctx.db.$transaction(async (tx) => {
        await tx.pick.deleteMany({ where: { leagueId: input.leagueId } });
        await tx.mozgovWindow.deleteMany({ where: { leagueId: input.leagueId } });
        await tx.draftSlot.deleteMany({ where: { game: { leagueId: input.leagueId } } });
        await tx.game.deleteMany({ where: { leagueId: input.leagueId } });
        await tx.league.delete({ where: { id: input.leagueId } });
      });
      return { success: true };
    }),
});
