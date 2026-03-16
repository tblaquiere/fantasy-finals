import { type JobInsert, PgBoss } from "pg-boss";

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
