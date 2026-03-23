/**
 * Shared tRPC router helpers — league membership & role enforcement.
 *
 * Extracted from league.ts and draft.ts to avoid duplication.
 */

import { TRPCError } from "@trpc/server";
import { type PrismaClient } from "generated/prisma";

/** Verify caller is the commissioner of a specific league. Admins bypass. */
export async function enforceLeagueCommissioner(
  db: PrismaClient,
  userId: string,
  leagueId: string,
  isAdmin: boolean,
): Promise<void> {
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

/** Verify caller is a participant in the league. Admins bypass. */
export async function enforceLeagueMember(
  db: PrismaClient,
  userId: string,
  leagueId: string,
  isAdmin: boolean,
): Promise<void> {
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
