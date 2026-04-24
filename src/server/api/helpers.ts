/**
 * Shared tRPC router helpers — league membership & role enforcement.
 *
 * Extracted from league.ts and draft.ts to avoid duplication.
 */

import { TRPCError } from "@trpc/server";
import { type PrismaClient } from "generated/prisma";

interface EnforceOptions {
  /** When true, skip the soft-delete guard (e.g. for restore/permanent-delete actions). */
  allowDeleted?: boolean;
}

async function assertLeagueLive(db: PrismaClient, leagueId: string): Promise<void> {
  const league = await db.league.findFirst({
    where: { id: leagueId, deletedAt: null },
    select: { id: true },
  });
  if (!league) {
    throw new TRPCError({ code: "NOT_FOUND", message: "League not found" });
  }
}

/** Verify caller is the commissioner of a specific league. Admins bypass role check, not soft-delete. */
export async function enforceLeagueCommissioner(
  db: PrismaClient,
  userId: string,
  leagueId: string,
  isAdmin: boolean,
  options: EnforceOptions = {},
): Promise<void> {
  if (!options.allowDeleted) {
    await assertLeagueLive(db, leagueId);
  }
  if (isAdmin) return;
  const member = await db.participant.findUnique({
    where: { userId_leagueId: { userId, leagueId } },
  });
  if (!member?.isCommissioner) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Not a commissioner of this league",
    });
  }
}

/** Verify caller is a participant in the league. Admins bypass role check, not soft-delete. */
export async function enforceLeagueMember(
  db: PrismaClient,
  userId: string,
  leagueId: string,
  isAdmin: boolean,
  options: EnforceOptions = {},
): Promise<void> {
  if (!options.allowDeleted) {
    await assertLeagueLive(db, leagueId);
  }
  if (isAdmin) return;
  const member = await db.participant.findUnique({
    where: { userId_leagueId: { userId, leagueId } },
  });
  if (!member) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Not a member of this league",
    });
  }
}
