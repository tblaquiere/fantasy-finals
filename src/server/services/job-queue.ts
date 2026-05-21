import { type JobInsert, PgBoss } from "pg-boss";

import { db } from "~/server/db";
import { env } from "~/env.js";
import { JOB_QUEUES, type JobQueueName } from "~/lib/job-queues";

// Use JobInsert options type directly — more explicit than Parameters<> extraction
type SendOptions = Omit<JobInsert, "name" | "data">;

// Cache the promise, not the resolved instance — prevents race condition when
// multiple concurrent requests call enqueueJob() before the first start() resolves
let bossPromise: Promise<PgBoss> | null = null;

async function initBoss(): Promise<PgBoss> {
  const boss = new PgBoss(env.DATABASE_URL);
  boss.on("error", (err: unknown) =>
    console.error("[job-queue] pg-boss error:", err),
  );
  await boss.start();

  // createQueue is idempotent — safe to call on every web server startup
  for (const queue of JOB_QUEUES) {
    await boss.createQueue(queue.name, queue);
  }

  return boss;
}

function getBoss(): Promise<PgBoss> {
  bossPromise ??= initBoss();
  return bossPromise;
}

export async function enqueueJob<T extends object>(
  name: JobQueueName,
  payload: T,
  options?: SendOptions,
): Promise<string | null> {
  const boss = await getBoss();
  return boss.send(name, payload, options ?? {});
}

/**
 * Enqueue a job, replacing any already-queued job with the same singletonKey.
 *
 * pg-boss's default `singletonKey` semantics REJECT duplicate enqueues rather
 * than replacing them — `boss.send()` simply returns null for the duplicate.
 * For the re-enqueue patterns introduced in Story 7.1 (per-game offset edit,
 * reconcile-loop tipoff drift, participant-count bump) we want replacement,
 * not rejection. We delete any not-yet-started jobs (state in 'created' /
 * 'retry') matching the singletonKey, then send fresh. Active jobs (state
 * 'active') are NOT cancelled — they're already running.
 */
export async function replaceJob<T extends object>(
  name: JobQueueName,
  singletonKey: string,
  payload: T,
  options?: Omit<SendOptions, "singletonKey">,
): Promise<string | null> {
  await db.$executeRawUnsafe(
    `DELETE FROM pgboss.job WHERE name = $1 AND singleton_key = $2 AND state IN ('created','retry')`,
    name,
    singletonKey,
  );
  const boss = await getBoss();
  return boss.send(name, payload, { ...(options ?? {}), singletonKey });
}

/**
 * Cancel any not-yet-started jobs matching the given queue name + singletonKey.
 * Used when we want to remove a stale scheduled job without enqueuing a
 * replacement (e.g. clearing a per-game override while tipoff is still
 * unknown — Story 7.1 H1). Active jobs (already running) are not cancelled.
 */
export async function cancelJob(
  name: JobQueueName,
  singletonKey: string,
): Promise<void> {
  await db.$executeRawUnsafe(
    `DELETE FROM pgboss.job WHERE name = $1 AND singleton_key = $2 AND state IN ('created','retry')`,
    name,
    singletonKey,
  );
}
