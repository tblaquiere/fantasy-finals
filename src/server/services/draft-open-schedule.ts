/**
 * Draft Open Schedule Service — Story 7.1
 *
 * Pure helpers for the auto-open-draft-window feature:
 *  - minLegalOffsetMinutes / validateOffset: the participants × clock + buffer rule
 *  - effectiveOffset: per-game override wins over league default
 *
 * Schedule writes + job re-enqueue live in:
 *  - src/worker/jobs/draft-order-publish.ts (calcDraftOpenTime, modified by 7.1)
 *  - src/server/services/draft-order.ts (autoGenerateProvisionalNext, modified by 7.1)
 *
 * The two side-effecting helpers below (revalidateOffsetsForLeague,
 * rescheduleAllPendingGames) are thin orchestrators that combine pure logic
 * with database writes and pg-boss enqueues.
 */

import type { PrismaClient } from "../../../generated/prisma/index.js";
import { DRAFT_TIPOFF_BUFFER_MINUTES } from "~/lib/constants";
// NOTE: job-queue is imported lazily inside the orchestrator functions below
// (revalidateOffsetsForLeague, rescheduleAllPendingGames) so that consumers of
// the pure helpers don't transitively pull in env/db at module load time.

export function minLegalOffsetMinutes(
  participantCount: number,
  clockDurationMinutes: number,
): number {
  return participantCount * clockDurationMinutes + DRAFT_TIPOFF_BUFFER_MINUTES;
}

export type ValidateOffsetResult =
  | { ok: true }
  | { ok: false; minRequired: number; message: string };

export function validateOffset(
  participantCount: number,
  clockDurationMinutes: number,
  offset: number,
): ValidateOffsetResult {
  const minRequired = minLegalOffsetMinutes(participantCount, clockDurationMinutes);
  if (offset >= minRequired) return { ok: true };
  return {
    ok: false,
    minRequired,
    message:
      `With ${participantCount} participants × ${clockDurationMinutes}-min clocks + ${DRAFT_TIPOFF_BUFFER_MINUTES}-min buffer, ` +
      `set the offset to at least ${minRequired} minutes before tipoff.`,
  };
}

/**
 * Resolve the effective offset for a game. Per-game override wins over league
 * default. Null override means inherit.
 */
export function effectiveOffset(
  game: { draftOpenOffsetMinutes: number | null },
  league: { draftOpenOffsetMinutes: number },
): number {
  return game.draftOpenOffsetMinutes ?? league.draftOpenOffsetMinutes;
}

/**
 * Compute `draftOpensAt = tipoff − offset`. Returns null when tipoff is not yet
 * known. Stateless; safe to call from any context.
 */
export function computeDraftOpensAt(
  tipoffUTC: Date | null | undefined,
  offsetMinutes: number,
): Date | null {
  if (!tipoffUTC) return null;
  return new Date(tipoffUTC.getTime() - offsetMinutes * 60_000);
}

/**
 * Iterate every pending Game in the league. For any game whose effective
 * offset is now below the legal minimum (e.g. after a participant joins),
 * auto-bump the per-game `draftOpenOffsetMinutes` to the new minimum,
 * recompute `draftOpensAt`, replace the queued draft.open job, and notify
 * the commissioner.
 *
 * Returns the list of game ids that were bumped.
 */
export async function revalidateOffsetsForLeague(
  db: PrismaClient,
  leagueId: string,
): Promise<{ bumpedGameIds: string[] }> {
  const { enqueueJob, replaceJob } = await import("./job-queue");

  const league = await db.league.findUnique({
    where: { id: leagueId },
    select: {
      id: true,
      clockDurationMinutes: true,
      draftOpenOffsetMinutes: true,
      participants: { select: { id: true, isCommissioner: true, userId: true } },
    },
  });
  if (!league) return { bumpedGameIds: [] };

  const participantCount = league.participants.length;
  const newMin = minLegalOffsetMinutes(participantCount, league.clockDurationMinutes);

  const pendingGames = await db.game.findMany({
    where: { leagueId, status: "pending" },
    select: {
      id: true,
      gameNumber: true,
      nbaGameId: true,
      draftOpenOffsetMinutes: true,
    },
  });

  const bumpedGameIds: string[] = [];
  const commissionerUserIds = league.participants
    .filter((p) => p.isCommissioner)
    .map((p) => p.userId);

  for (const game of pendingGames) {
    const eff = effectiveOffset(game, league);
    if (eff >= newMin) continue;

    // Bump the per-game override to the new minimum (preserves audit trail —
    // we know this game was auto-adjusted because its override differs from
    // the league default).
    await db.game.update({
      where: { id: game.id },
      data: { draftOpenOffsetMinutes: newMin },
    });
    bumpedGameIds.push(game.id);

    // Re-schedule draft.open using the fresh offset.
    const nbaGame = await db.nbaGame.findUnique({
      where: { nbaGameId: game.nbaGameId },
      select: { gameDate: true },
    });
    const newDraftOpensAt = computeDraftOpensAt(nbaGame?.gameDate, newMin);
    if (newDraftOpensAt) {
      await db.game.update({
        where: { id: game.id },
        data: { draftOpensAt: newDraftOpensAt },
      });
      await replaceJob(
        "draft.open",
        `draft.open:${game.id}`,
        { leagueId, gameId: game.id },
        { startAfter: newDraftOpensAt },
      );
    }
  }

  // Send ONE notification per commissioner per revalidate pass, regardless of
  // how many games were bumped (avoids notification spam when a single join
  // adjusts every pending game).
  if (bumpedGameIds.length > 0) {
    for (const userId of commissionerUserIds) {
      await enqueueJob("notification.send", {
        userId,
        type: "draft-offset-bumped",
        leagueId,
        link: `/league/${leagueId}`,
      });
    }
  }

  return { bumpedGameIds };
}

/**
 * After the league default offset changes, recompute draftOpensAt for every
 * pending game that is currently using the default (i.e. has a null
 * per-game override). Games with explicit overrides are left untouched.
 *
 * Pending games with no known tipoff are skipped; the reconcile loop will
 * pick them up when tipoff resolves.
 */
export async function rescheduleAllPendingGames(
  db: PrismaClient,
  leagueId: string,
): Promise<void> {
  const { replaceJob } = await import("./job-queue");

  const league = await db.league.findUnique({
    where: { id: leagueId },
    select: { id: true, draftOpenOffsetMinutes: true },
  });
  if (!league) return;

  const games = await db.game.findMany({
    where: { leagueId, status: "pending", draftOpenOffsetMinutes: null },
    select: { id: true, nbaGameId: true },
  });

  for (const game of games) {
    const nbaGame = await db.nbaGame.findUnique({
      where: { nbaGameId: game.nbaGameId },
      select: { gameDate: true },
    });
    const newDraftOpensAt = computeDraftOpensAt(
      nbaGame?.gameDate,
      league.draftOpenOffsetMinutes,
    );
    if (!newDraftOpensAt) continue;

    await db.game.update({
      where: { id: game.id },
      data: { draftOpensAt: newDraftOpensAt },
    });
    await replaceJob(
      "draft.open",
      `draft.open:${game.id}`,
      { leagueId, gameId: game.id },
      { startAfter: newDraftOpensAt },
    );
  }
}
