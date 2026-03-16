import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { type PrismaClient } from "generated/prisma";
import { createTRPCRouter, adminProcedure, commissionerProcedure, protectedProcedure, publicProcedure } from "~/server/api/trpc";
import { CLOCK_DURATION_OPTIONS, SERIES_STUBS } from "~/lib/constants";

const seriesIds = SERIES_STUBS.map((s) => s.id) as [string, ...string[]];
const validClockMinutes = new Set<number>(CLOCK_DURATION_OPTIONS);

/** Verify caller is the commissioner of a specific league. Admins bypass. */
async function enforceLeagueCommissioner(
  db: PrismaClient,
  userId: string,
  leagueId: string,
  isAdmin: boolean,
) {
  if (isAdmin) return;
  const member = await db.participant.findUnique({
    where: { userId_leagueId: { userId, leagueId } },
  });
  if (!member?.isCommissioner) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Not a commissioner of this league" });
  }
}

export const leagueRouter = createTRPCRouter({
  getAllLeagues: adminProcedure
    .query(async ({ ctx }) => {
      const leagues = await ctx.db.league.findMany({
        select: {
          id: true,
          name: true,
          seriesId: true,
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
        where: { userId },
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
        participantCount: p.league._count.participants,
        isCommissioner: p.isCommissioner,
        joinedAt: p.joinedAt,
      }));
    }),

  createLeague: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(60),
        seriesId: z.enum(seriesIds),
        clockDurationMinutes: z.number().int().refine(
          (v) => validClockMinutes.has(v),
          { message: `Must be one of: ${[...CLOCK_DURATION_OPTIONS].join(", ")}` },
        ),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Wrap all writes in a transaction for atomicity
      const league = await ctx.db.$transaction(async (tx) => {
        const created = await tx.league.create({
          data: {
            name: input.name,
            seriesId: input.seriesId,
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

      const league = await ctx.db.league.findUnique({
        where: { id: input.leagueId },
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

      const league = await ctx.db.league.findUnique({
        where: { id: input.leagueId },
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
      const league = await ctx.db.league.findUnique({
        where: { inviteToken: input.token },
        select: {
          name: true,
          seriesId: true,
          _count: { select: { participants: true } },
        },
      });

      if (!league) return null;

      return {
        name: league.name,
        seriesId: league.seriesId,
        participantCount: league._count.participants,
      };
    }),

  joinLeague: protectedProcedure
    .input(z.object({ token: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const league = await ctx.db.league.findUnique({
        where: { inviteToken: input.token },
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

  regenerateInviteToken: commissionerProcedure
    .input(z.object({ leagueId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await enforceLeagueCommissioner(
        ctx.db, ctx.session.user.id, input.leagueId, ctx.session.user.role === "admin",
      );

      // Verify league exists before updating
      const existing = await ctx.db.league.findUnique({
        where: { id: input.leagueId },
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
});
