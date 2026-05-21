/**
 * draft.order-publish handler — Stories 3.4, 7.1
 *
 * Fired ~30 minutes after a game concludes with final scores confirmed.
 * 1. Generates + persists the draft order for the next game.
 * 2. Computes draftOpensAt = tipoff − effectiveOffset (Story 7.1; replaces
 *    the legacy "9am PST next day" trigger).
 * 3. Persists draftOpensAt + draftClosesAt on Game.
 * 4. Replaces any queued draft.open job for this game with one scheduled
 *    at the new draftOpensAt.
 * 5. Enqueues notification.send for all participants.
 *
 * If tipoff is unknown when this fires, draftOpensAt is not persisted and
 * no draft.open is queued — the hourly draft.reconcile loop (Story 7.1)
 * picks the game up once NbaGame.gameDate is populated.
 */

import type { Job } from "pg-boss";

import { db } from "~/server/db";
import { generateAndPersistDraftOrder } from "~/server/services/draft-order";
import { enqueueJob, replaceJob } from "~/server/services/job-queue";
import {
  effectiveOffset,
  computeDraftOpensAt,
} from "~/server/services/draft-open-schedule";

export type DraftOrderPublishPayload = {
  leagueId: string;
  nbaGameId: string; // the game to draft for (the NEXT game)
  tipOffTime?: string; // ISO string of next game tip-off (for draftClosesAt)
};

/**
 * Compute the auto-open time for a draft: `tipoffUTC − offsetMinutes`.
 * Story 7.1 replaced the legacy "9am PST next day" logic with this
 * tipoff-relative calculation so commissioners can configure how early
 * each draft opens via League.draftOpenOffsetMinutes (with optional
 * per-game override on Game.draftOpenOffsetMinutes).
 *
 * Returns null when tipoff is not yet known (the reconcile loop will
 * re-attempt scheduling once tipoff resolves).
 */
export function calcDraftOpenTime(
  tipoffUTC: Date | null | undefined,
  offsetMinutes: number,
): Date | null {
  return computeDraftOpensAt(tipoffUTC, offsetMinutes);
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

  // 2. Resolve tipoff. Prefer the payload field, fall back to NbaGame.gameDate.
  let tipoff: Date | null = tipOffTime ? new Date(tipOffTime) : null;
  if (!tipoff) {
    const nbaGame = await db.nbaGame.findUnique({
      where: { nbaGameId },
      select: { gameDate: true },
    });
    tipoff = nbaGame?.gameDate ?? null;
  }
  const draftClosesAt = tipoff;

  // 3. Resolve the effective offset (per-game override > league default).
  const game = await db.game.findUnique({
    where: { id: gameId },
    include: { league: { select: { draftOpenOffsetMinutes: true } } },
  });
  if (!game) {
    console.error(`[worker] draft.order-publish: game ${gameId} not found post-generate`);
    return;
  }
  const offset = effectiveOffset(game, game.league);

  // 4. Compute draftOpensAt. If tipoff is unknown, persist only what we know
  // and let draft.reconcile fill in draftOpensAt when tipoff resolves.
  const draftOpensAt = calcDraftOpenTime(tipoff, offset);

  await db.game.update({
    where: { id: gameId },
    data: {
      draftOpensAt: draftOpensAt ?? null,
      draftClosesAt,
    },
  });

  if (draftOpensAt) {
    await replaceJob(
      "draft.open",
      `draft.open:${gameId}`,
      { leagueId, gameId },
      { startAfter: draftOpensAt },
    );
  } else {
    console.log(
      `[worker] draft.order-publish: tipoff unknown for ${nbaGameId}; deferring draft.open enqueue to reconcile loop`,
    );
  }

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
    `[worker] draft.order-publish complete: gameId=${gameId} opensAt=${draftOpensAt?.toISOString() ?? "deferred"}`,
  );
}
