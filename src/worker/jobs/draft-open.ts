/**
 * draft.open handler — Story 3.4
 *
 * Fires at 9am PST (scheduled by draft.order-publish).
 * 1. Transitions Game status: pending → draft-open
 * 2. Starts the first participant's selection clock
 * 3. Enqueues clock.expire job for the first slot
 */

import type { Job } from "pg-boss";

import { db } from "~/server/db";
import { enqueueJob } from "~/server/services/job-queue";

export type DraftOpenPayload = {
  leagueId: string;
  gameId: string;
};

export async function handleDraftOpen(
  jobs: Job<DraftOpenPayload>[],
): Promise<void> {
  const job = jobs[0];
  if (!job) return;

  const { leagueId, gameId } = job.data;

  console.log(
    `[worker] draft.open: leagueId=${leagueId} gameId=${gameId}`,
  );

  // Load game with league to get clock duration
  const game = await db.game.findUniqueOrThrow({
    where: { id: gameId },
    include: {
      league: { select: { clockDurationMinutes: true } },
      draftSlots: { orderBy: { pickPosition: "asc" } },
    },
  });

  // Guard: only open if still pending
  if (game.status !== "pending") {
    console.log(
      `[worker] draft.open: game ${gameId} status is ${game.status}, skipping`,
    );
    return;
  }

  const firstSlot = game.draftSlots[0];
  if (!firstSlot) {
    console.error(`[worker] draft.open: no draft slots for game ${gameId}`);
    return;
  }

  const now = new Date();
  const clockExpiresAt = new Date(
    now.getTime() + game.league.clockDurationMinutes * 60 * 1000,
  );

  // Transition game status and start first clock in a transaction
  await db.$transaction([
    db.game.update({
      where: { id: gameId },
      data: { status: "draft-open" },
    }),
    db.draftSlot.update({
      where: { id: firstSlot.id },
      data: { clockStartsAt: now, clockExpiresAt },
    }),
  ]);

  // Schedule clock.expire job
  await enqueueJob(
    "clock.expire",
    { slotId: firstSlot.id, leagueId, gameId },
    { startAfter: clockExpiresAt },
  );

  console.log(
    `[worker] draft.open complete: first slot=${firstSlot.id} expiresAt=${clockExpiresAt.toISOString()}`,
  );
}
