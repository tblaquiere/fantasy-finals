import { PgBoss } from "pg-boss";

import { JOB_QUEUES } from "~/lib/job-queues";
import { handleClockExpire } from "./jobs/clock-expire";
import { handleDraftOpen } from "./jobs/draft-open";
import { handleDraftOrderPublish } from "./jobs/draft-order-publish";
import { handleHalftimeCheck } from "./jobs/halftime-check";
import { handleStatsCorrect } from "./jobs/stats-correct";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("[worker] DATABASE_URL not set — exiting");
    process.exit(1);
  }

  const boss = new PgBoss(databaseUrl);
  boss.on("error", (err: unknown) => console.error("[worker] pg-boss error:", err));

  await boss.start();
  console.log("[worker] pg-boss started");

  // createQueue MUST be called before work() in pg-boss v10+
  for (const queue of JOB_QUEUES) {
    await boss.createQueue(queue.name, queue);
    console.log(`[worker] queue ready: ${queue.name}`);
  }

  // Register handlers — stubs for now; full implementations in later stories
  await boss.work("draft.order-publish", handleDraftOrderPublish);
  await boss.work("draft.open", handleDraftOpen);
  await boss.work("clock.expire", handleClockExpire);
  await boss.work("halftime.check", handleHalftimeCheck);
  await boss.work("stats.correct", handleStatsCorrect);
  // notification.send — stub until FCM dispatch handler is implemented
  await boss.work("notification.send", async (jobs) => {
    const job = jobs[0];
    if (job) console.log(`[worker] notification.send: id=${job.id}`);
  });

  console.log("[worker] all handlers registered — ready");

  const shutdown = async (signal: string) => {
    console.log(`[worker] ${signal} received — shutting down`);
    await boss.stop({ timeout: 30_000 });
    console.log("[worker] pg-boss stopped");
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  console.error("[worker] fatal startup error:", err);
  process.exit(1);
});
