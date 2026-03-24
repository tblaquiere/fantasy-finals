/**
 * Draft Window Service — Story 3.4
 *
 * Manages the draft window lifecycle: opening, clock advancement, and closing.
 */

import type { PrismaClient } from "generated/prisma";
import { enqueueJob } from "~/server/services/job-queue";

/**
 * Advance the selection clock after a pick is submitted.
 * Stops the current slot's clock and starts the next participant's clock.
 * Returns the new active slot, or null if all picks are done.
 */
export async function advanceClock(
  db: PrismaClient,
  gameId: string,
  completedSlotId: string,
) {
  const game = await db.game.findUniqueOrThrow({
    where: { id: gameId },
    include: {
      league: { select: { id: true, clockDurationMinutes: true } },
      draftSlots: { orderBy: { pickPosition: "asc" } },
    },
  });

  const completedSlotIndex = game.draftSlots.findIndex(
    (s) => s.id === completedSlotId,
  );
  if (completedSlotIndex === -1) {
    throw new Error(`Slot ${completedSlotId} not found in game ${gameId}`);
  }

  const nextSlot = game.draftSlots[completedSlotIndex + 1];

  // Clear the completed slot's clock
  await db.draftSlot.update({
    where: { id: completedSlotId },
    data: { clockExpiresAt: null },
  });

  if (!nextSlot) {
    // All picks done — no more clocks to start
    return null;
  }

  const now = new Date();
  const clockExpiresAt = new Date(
    now.getTime() + game.league.clockDurationMinutes * 60 * 1000,
  );

  // Start next slot's clock
  await db.draftSlot.update({
    where: { id: nextSlot.id },
    data: { clockStartsAt: now, clockExpiresAt },
  });

  // Schedule clock.expire for the next slot
  await enqueueJob(
    "clock.expire",
    { slotId: nextSlot.id, leagueId: game.league.id, gameId },
    { startAfter: clockExpiresAt },
  );

  return nextSlot;
}

/**
 * Close the draft window. Sets game status to 'active' and clears any running clocks.
 * Called when tip-off time is reached.
 */
export async function closeDraftWindow(
  db: PrismaClient,
  gameId: string,
) {
  await db.$transaction([
    db.game.update({
      where: { id: gameId },
      data: { status: "active" },
    }),
    // Clear all running clocks
    db.draftSlot.updateMany({
      where: {
        gameId,
        clockExpiresAt: { not: null },
      },
      data: { clockStartsAt: null, clockExpiresAt: null },
    }),
  ]);
}

/**
 * Open the draft window manually (commissioner fallback).
 * Same logic as draft.open handler but callable from tRPC.
 */
export async function openDraftWindow(
  db: PrismaClient,
  gameId: string,
) {
  const game = await db.game.findUniqueOrThrow({
    where: { id: gameId },
    include: {
      league: { select: { id: true, clockDurationMinutes: true } },
      draftSlots: { orderBy: { pickPosition: "asc" } },
    },
  });

  if (game.status !== "pending") {
    throw new Error(`Cannot open draft: game status is ${game.status}`);
  }

  const firstSlot = game.draftSlots[0];
  if (!firstSlot) {
    throw new Error("No draft slots found for this game");
  }

  const now = new Date();
  const clockExpiresAt = new Date(
    now.getTime() + game.league.clockDurationMinutes * 60 * 1000,
  );

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

  await enqueueJob(
    "clock.expire",
    { slotId: firstSlot.id, leagueId: game.league.id, gameId },
    { startAfter: clockExpiresAt },
  );

  return firstSlot;
}

export type DraftStatusResult = {
  status: string;
  draftOpensAt: Date | null;
  draftClosesAt: Date | null;
  activeSlot: {
    id: string;
    participantId: string;
    pickPosition: number;
    clockStartsAt: Date | null;
    clockExpiresAt: Date | null;
  } | null;
  slots: Array<{
    id: string;
    participantId: string;
    pickPosition: number;
    clockStartsAt: Date | null;
    clockExpiresAt: Date | null;
  }>;
};

/**
 * Get the current draft status for a game.
 * Returns game status, active slot (whose turn), clock expiry, and all slots.
 */
export async function getDraftStatus(
  db: PrismaClient,
  gameId: string,
): Promise<DraftStatusResult> {
  const game = await db.game.findUniqueOrThrow({
    where: { id: gameId },
    include: {
      draftSlots: {
        orderBy: { pickPosition: "asc" },
        select: {
          id: true,
          participantId: true,
          pickPosition: true,
          clockStartsAt: true,
          clockExpiresAt: true,
        },
      },
    },
  });

  // The active slot is the one with a running clock (clockExpiresAt in the future)
  const now = new Date();
  const activeSlot =
    game.draftSlots.find(
      (s) => s.clockExpiresAt && s.clockExpiresAt > now,
    ) ?? null;

  return {
    status: game.status,
    draftOpensAt: game.draftOpensAt,
    draftClosesAt: game.draftClosesAt,
    activeSlot,
    slots: game.draftSlots,
  };
}
