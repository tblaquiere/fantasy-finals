/**
 * draft.reconcile handler — Story 7.1
 *
 * Runs hourly. For each upcoming pending game with a scheduled draftOpensAt,
 * re-resolves NBA tipoff from the cached schedule and re-enqueues draft.open
 * (replacing the prior queued job) when tipoff has drifted by more than
 * DRAFT_RECONCILE_DRIFT_THRESHOLD_MINUTES.
 *
 * Self-scheduling: always enqueues the next run before returning. The job is
 * deduped by singletonKey="draft.reconcile:singleton" so worker restarts
 * don't queue duplicate reconcile loops.
 */

import type { Job } from "pg-boss";

import { db } from "~/server/db";
import { enqueueJob, replaceJob } from "~/server/services/job-queue";
import {
  effectiveOffset,
  computeDraftOpensAt,
} from "~/server/services/draft-open-schedule";
import {
  DRAFT_RECONCILE_DRIFT_THRESHOLD_MINUTES,
  DRAFT_RECONCILE_INTERVAL_MS,
} from "~/lib/constants";

export type DraftReconcilePayload = Record<string, never>;

const RECONCILE_SINGLETON_KEY = "draft.reconcile:singleton";

function scheduleNext() {
  void enqueueJob(
    "draft.reconcile",
    {},
    {
      startAfter: new Date(Date.now() + DRAFT_RECONCILE_INTERVAL_MS),
      singletonKey: RECONCILE_SINGLETON_KEY,
    },
  ).catch((err) =>
    console.error("[worker] draft.reconcile: reschedule error:", err),
  );
}

export async function handleDraftReconcile(
  jobs: Job<DraftReconcilePayload>[],
): Promise<void> {
  const job = jobs[0];
  if (!job) return;

  console.log("[worker] draft.reconcile: starting pass");

  try {
    const now = new Date();
    const games = await db.game.findMany({
      where: {
        status: "pending",
        draftOpensAt: { not: null, gt: now },
      },
      include: {
        league: { select: { draftOpenOffsetMinutes: true } },
      },
    });

    let reenqueued = 0;
    const driftThresholdMs = DRAFT_RECONCILE_DRIFT_THRESHOLD_MINUTES * 60_000;

    for (const game of games) {
      const nbaGame = await db.nbaGame.findUnique({
        where: { nbaGameId: game.nbaGameId },
        select: { gameDate: true },
      });
      if (!nbaGame?.gameDate) {
        // Tipoff still unknown; cannot reconcile until it resolves.
        continue;
      }

      const offset = effectiveOffset(game, game.league);
      const newDraftOpensAt = computeDraftOpensAt(nbaGame.gameDate, offset);
      if (!newDraftOpensAt || !game.draftOpensAt) continue;

      const driftMs = Math.abs(
        newDraftOpensAt.getTime() - game.draftOpensAt.getTime(),
      );
      if (driftMs <= driftThresholdMs) continue;

      await db.game.update({
        where: { id: game.id },
        data: { draftOpensAt: newDraftOpensAt },
      });
      await replaceJob(
        "draft.open",
        `draft.open:${game.id}`,
        { leagueId: game.leagueId, gameId: game.id },
        { startAfter: newDraftOpensAt },
      );
      reenqueued++;
      console.log(
        `[worker] draft.reconcile: re-enqueued draft.open for game ${game.id} (drift=${Math.round(driftMs / 60_000)}min)`,
      );
    }

    console.log(
      `[worker] draft.reconcile: pass complete — checked=${games.length} reenqueued=${reenqueued}`,
    );
  } catch (err) {
    console.error("[worker] draft.reconcile: pass error:", err);
  } finally {
    scheduleNext();
  }
}
