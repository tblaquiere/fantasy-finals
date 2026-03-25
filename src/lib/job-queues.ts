// Shared pg-boss queue definitions — imported by both web server (job-queue.ts)
// and worker process (worker/index.ts). createQueue() is idempotent so calling
// it from both sides is safe regardless of which process starts first.

export const JOB_QUEUES = [
  {
    name: "draft.open",
    retryLimit: 3,
    retryDelay: 30,
    retryBackoff: true,
    expireInSeconds: 300,
    deleteAfterSeconds: 604800, // 7 days
  },
  {
    name: "clock.expire",
    retryLimit: 3,
    retryDelay: 10,
    retryBackoff: false,
    expireInSeconds: 60,
    deleteAfterSeconds: 86400, // 1 day — high-frequency, prune aggressively
  },
  {
    name: "halftime.check",
    retryLimit: 2,
    retryDelay: 30,
    retryBackoff: true,
    expireInSeconds: 120,
    deleteAfterSeconds: 86400, // 1 day
  },
  {
    name: "stats.correct",
    retryLimit: 5,
    retryDelay: 60,
    retryBackoff: true,
    expireInSeconds: 600,
    deleteAfterSeconds: 604800, // 7 days — keep for audit
  },
  {
    name: "draft.order-publish",
    retryLimit: 3,
    retryDelay: 30,
    retryBackoff: true,
    expireInSeconds: 300,
    deleteAfterSeconds: 604800, // 7 days
  },
  {
    name: "scores.poll",
    retryLimit: 2,
    retryDelay: 15,
    retryBackoff: false,
    expireInSeconds: 45,
    deleteAfterSeconds: 86400, // 1 day — high-frequency polling
  },
  {
    name: "notification.send",
    retryLimit: 2,
    retryDelay: 30,
    retryBackoff: true,
    expireInSeconds: 60,
    deleteAfterSeconds: 86400, // 1 day — high-frequency, prune aggressively
  },
] as const;

export type JobQueueName = (typeof JOB_QUEUES)[number]["name"];
