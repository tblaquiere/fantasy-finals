/**
 * Mozgov Window Service — Story 5.1
 *
 * Manages Mozgov replacement window clock advancement.
 * Shared between worker jobs and tRPC router.
 */

import type { PrismaClient } from "generated/prisma";
import { enqueueJob } from "~/server/services/job-queue";
import { MOZGOV_CLOCK_MINUTES } from "~/lib/constants";

/**
 * Start the clock for the next pending Mozgov window.
 * Called after a window is completed/expired to advance the sequence.
 */
export async function startNextMozgovClock(
  db: PrismaClient,
  gameId: string,
  leagueId: string,
): Promise<void> {
  const nextWindow = await db.mozgovWindow.findFirst({
    where: { gameId, status: "pending" },
    orderBy: { order: "asc" },
    include: { participant: { select: { userId: true } } },
  });

  if (!nextWindow) return;

  const now = new Date();
  const clockExpiresAt = new Date(
    now.getTime() + MOZGOV_CLOCK_MINUTES * 60 * 1000,
  );

  await db.mozgovWindow.update({
    where: { id: nextWindow.id },
    data: {
      status: "active",
      clockStartsAt: now,
      clockExpiresAt,
    },
  });

  // Schedule auto-assign on expiry
  await enqueueJob(
    "clock.expire",
    {
      slotId: nextWindow.id,
      leagueId,
      gameId,
      mozgov: true,
    },
    { startAfter: clockExpiresAt },
  );

  // Notify participant it's their turn
  await enqueueJob("notification.send", {
    userId: nextWindow.participant.userId,
    type: "mozgov-your-turn",
    leagueId,
    gameId,
    link: `/league/${leagueId}/game/${gameId}/mozgov`,
  });
}
