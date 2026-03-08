// src/worker/index.ts
// STUB: Full implementation in Story 1.6 (Background Job Worker)
// This file must exist for the Procfile worker process to start without crashing.
//
// Story 1.6 will:
//   - Install and initialize pg-boss v12
//   - Register job handlers: draft.open, clock.expire, halftime.check, stats.correct
//   - Connect to Railway PostgreSQL via DATABASE_URL (same Prisma client as web server)

console.log("Worker process started (stub — full implementation in Story 1.6)");

// Keep process alive so Railway doesn't restart the worker process immediately
process.on("SIGTERM", () => {
  console.log("Worker shutting down...");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("Worker interrupted, shutting down...");
  process.exit(0);
});
