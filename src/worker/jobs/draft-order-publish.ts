/**
 * draft.order-publish handler — Story 3.4
 *
 * Fired ~30 minutes after a game concludes with final scores confirmed.
 * 1. Generates + persists the draft order for the next game.
 * 2. Sets draftOpensAt (9am PST next day) and draftClosesAt (next tip-off) on Game.
 * 3. Schedules draft.open job for draftOpensAt.
 * 4. Enqueues notification.send for all participants.
 */

import type { Job } from "pg-boss";

import { db } from "~/server/db";
import { generateAndPersistDraftOrder } from "~/server/services/draft-order";
import { enqueueJob } from "~/server/services/job-queue";

export type DraftOrderPublishPayload = {
  leagueId: string;
  nbaGameId: string; // the game to draft for (the NEXT game)
  tipOffTime?: string; // ISO string of next game tip-off (for draftClosesAt)
};

/**
 * Calculate the next 9am PST/PDT from a reference time.
 * Always uses America/Los_Angeles (handles DST automatically).
 */
export function calcDraftOpenTime(referenceDate: Date): Date {
  // Format the reference date in LA timezone to get the local date
  const laFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  });

  const parts = laFormatter.formatToParts(referenceDate);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const day = Number(parts.find((p) => p.type === "day")?.value);
  const hour = Number(parts.find((p) => p.type === "hour")?.value);

  // If it's already past 9am LA time, schedule for next day at 9am
  // If before 9am, schedule for today at 9am (unlikely for a game ending in evening)
  let targetDay = day;
  if (hour >= 9) {
    targetDay = day + 1;
  }

  // Build a date string in LA timezone and convert to UTC
  // Create date at 9:00 AM in Los Angeles
  const laDateStr = `${year}-${String(month).padStart(2, "0")}-${String(targetDay).padStart(2, "0")}T09:00:00`;

  // Get UTC offset for that specific date in LA timezone
  const tempDate = new Date(laDateStr + "Z");
  const utcFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "2-digit",
    hour12: false,
  });
  const utcHour = tempDate.getUTCHours();
  const laHour = Number(
    utcFormatter.formatToParts(tempDate).find((p) => p.type === "hour")?.value,
  );
  const offsetHours = utcHour - laHour;

  // 9am LA = 9 + offset in UTC
  const result = new Date(laDateStr + "Z");
  result.setUTCHours(9 + offsetHours, 0, 0, 0);

  return result;
}

export async function handleDraftOrderPublish(
  jobs: Job<DraftOrderPublishPayload>[],
): Promise<void> {
  const job = jobs[0];
  if (!job) return;

  const { leagueId, nbaGameId, tipOffTime } = job.data;

  console.log(
    `[worker] draft.order-publish: leagueId=${leagueId} nbaGameId=${nbaGameId}`,
  );

  // 1. Generate draft order (idempotent — returns existing if already created)
  const { gameId } = await generateAndPersistDraftOrder(
    db,
    leagueId,
    nbaGameId,
  );

  // 2. Calculate draft window times
  const now = new Date();
  const draftOpensAt = calcDraftOpenTime(now);
  const draftClosesAt = tipOffTime ? new Date(tipOffTime) : null;

  // 3. Update Game with window timestamps
  await db.game.update({
    where: { id: gameId },
    data: { draftOpensAt, draftClosesAt },
  });

  // 4. Schedule draft.open job for 9am PST
  await enqueueJob(
    "draft.open",
    { leagueId, gameId },
    { startAfter: draftOpensAt },
  );

  // 5. Notify all participants
  const participants = await db.participant.findMany({
    where: { leagueId },
    select: { userId: true },
  });

  for (const p of participants) {
    await enqueueJob("notification.send", {
      userId: p.userId,
      type: "draft-order-published",
      leagueId,
      gameId,
    });
  }

  console.log(
    `[worker] draft.order-publish complete: gameId=${gameId} opensAt=${draftOpensAt.toISOString()}`,
  );
}
