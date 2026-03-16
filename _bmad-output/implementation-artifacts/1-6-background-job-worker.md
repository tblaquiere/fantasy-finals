# Story 1.6: Background Job Worker

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a commissioner,
I want picks, draft timers, and game events to execute automatically without any manual intervention,
so that the league runs itself and I never have to manually trigger draft opens, clock expirations, or score updates.

## Acceptance Criteria

1. **Given** the Railway project is running, **when** both processes start, **then** the Next.js web server runs on the `web` process AND the pg-boss worker runs as a separate `worker` process AND both connect to the same Railway PostgreSQL instance.

2. **Given** a job is enqueued using the `domain.action` naming convention (e.g., `draft.open`, `clock.expire`), **when** the worker is running, **then** the job is picked up and executed by the registered handler AND completion/failure is logged.

3. **Given** a job handler throws an error, **when** the job fails, **then** the error is logged without silently swallowing exceptions AND pg-boss retries the job up to the queue's configured retry limit.

4. **Given** the `Procfile` exists at the project root with `web` and `worker` entries, **when** Railway starts the project (or `pnpm worker:dev` runs locally), **then** the worker process starts, pg-boss connects to the database, and logs confirm all queues and handlers are registered.

5. **Given** `enqueueJob(name, payload)` is called from server-side code (e.g., a future tRPC router), **when** the web server process calls it, **then** a job record is inserted into the pg-boss PostgreSQL tables and the worker picks it up on its next poll.

## Tasks / Subtasks

- [x] Task 1: Install pg-boss and move tsx to production dependencies (AC: #1, #2)
  - [x] Run `pnpm add pg-boss` — installs pg-boss v12.14.0
  - [x] Run `pnpm add -P tsx` — moved tsx from devDependencies to dependencies
  - [x] Run `pnpm typecheck` — zero errors

- [x] Task 2: Create `src/server/services/job-queue.ts` — pg-boss singleton + enqueue helper (AC: #2, #5)
  - [x] Lazy-init pg-boss singleton: start on first call, reuse across web server requests
  - [x] Call `createQueue()` for all queues on startup (pg-boss v10+ requires this before `send()`)
  - [x] Export `enqueueJob<T>(name: string, payload: T, options?: JobSendOptions): Promise<string | null>`
  - [x] See Dev Notes for full implementation

- [x] Task 3: Replace stub `src/worker/index.ts` with full pg-boss worker (AC: #1, #2, #3, #4)
  - [x] Remove the stub content and implement full pg-boss init
  - [x] Start pg-boss from `DATABASE_URL` directly (via `process.env.DATABASE_URL` — see Dev Notes)
  - [x] Call `createQueue()` for all five queues before registering handlers
  - [x] Register handlers: `draft.open`, `clock.expire`, `halftime.check`, `stats.correct`, `notification.send`
  - [x] Graceful shutdown: call `boss.stop({ timeout: 30_000 })` on SIGTERM/SIGINT before `process.exit(0)`
  - [x] See Dev Notes for full implementation

- [x] Task 4: Create stub job handler files in `src/worker/jobs/` (AC: #2, #3)
  - [x] Create `src/worker/jobs/draft-open.ts` — typed stub handler (log + return)
  - [x] Create `src/worker/jobs/clock-expire.ts` — typed stub handler (log + return)
  - [x] Create `src/worker/jobs/halftime-check.ts` — typed stub handler (log + return)
  - [x] Create `src/worker/jobs/stats-correct.ts` — typed stub handler (log + return)
  - [x] See Dev Notes for the exact stub handler pattern

- [x] Task 5: Add `worker:dev` script to `package.json` (AC: #4)
  - [x] Added `"worker:dev": "tsx --env-file=.env src/worker/index.ts"` to `scripts`
  - [x] Confirmed `Procfile` is already correct (created in Story 1.1):
    ```
    web: HOSTNAME=0.0.0.0 node .next/standalone/server.js
    worker: npx tsx src/worker/index.ts
    ```
  - [x] Run `pnpm typecheck` — zero errors

- [x] Task 6: Local verification (AC: #1, #2, #4)
  - [x] Ran `pnpm worker:dev` — pg-boss connected to Railway DB
  - [x] Verified logs: `[worker] pg-boss started`, all 5 queue names, `[worker] all handlers registered — ready`
  - [x] Process stayed alive — no crash
  - [x] Sent SIGINT → `[worker] SIGINT received — shutting down` → `[worker] pg-boss stopped`

- [x] Task 7: Lint and typecheck (AC: all)
  - [x] `pnpm typecheck` — 0 errors
  - [x] `SKIP_ENV_VALIDATION=true pnpm lint` — 0 errors

## Dev Notes

### CRITICAL: pg-boss v12 Breaking Changes from v8/v9

Most tutorials and examples use pg-boss v7 or v8. **v10+ (current: v12.14.0) has breaking changes that will cause silent failures if ignored:**

| Change | v8 | v12 |
|--------|-----|-----|
| `createQueue()` | Not required | **Required before `send()` or `work()`** — omitting causes errors |
| Handler receives | Single `job` object | **`job[]` array** — always destructure: `async ([job]) => {}` |
| Default retryLimit | 0 | **2** — explicitly set `retryLimit: 0` for non-idempotent jobs |
| `expireIn` | String `"00:15:00"` | **`expireInSeconds` integer** |
| Singleton jobs | `sendSingleton()` | **Queue `policy: 'stately'`** — `sendSingleton()` removed |
| `teamSize` option on `work()` | Supported | **Removed** |

### pg-boss Worker Process: Do NOT Import `~/env.js`

`@t3-oss/env-nextjs` is designed for the Next.js runtime. Importing it in the worker process may cause unexpected behavior since it references Next.js internals for edge-runtime detection.

**Use `process.env.DATABASE_URL` directly in the worker:**
```ts
// ✅ Correct in worker/index.ts
const boss = new PgBoss(process.env.DATABASE_URL!);

// ❌ Avoid in worker context
import { env } from "~/env.js"; // t3-env with Next.js adapter may misbehave
```

For `job-queue.ts` (which runs inside Next.js), importing `~/env.js` is fine and correct.

### Queue Definitions (Shared Across Worker and job-queue.ts)

Define these in a shared constant or repeat in both files — they are idempotent when called twice:

```ts
export const JOB_QUEUES = [
  {
    name: "draft.open",
    retryLimit: 3,
    retryDelay: 30,
    retryBackoff: true,
    expireInSeconds: 300,
  },
  {
    name: "clock.expire",
    retryLimit: 3,
    retryDelay: 10,
    retryBackoff: false,
    expireInSeconds: 60,
  },
  {
    name: "halftime.check",
    retryLimit: 2,
    retryDelay: 30,
    retryBackoff: true,
    expireInSeconds: 120,
  },
  {
    name: "stats.correct",
    retryLimit: 5,
    retryDelay: 60,
    retryBackoff: true,
    expireInSeconds: 600,
  },
  {
    name: "notification.send",
    retryLimit: 2,
    retryDelay: 30,
    retryBackoff: true,
    expireInSeconds: 60,
  },
] as const;

export type JobQueueName = (typeof JOB_QUEUES)[number]["name"];
```

Place this in `src/lib/job-queues.ts` and import from both `src/server/services/job-queue.ts` and `src/worker/index.ts`.

### `src/server/services/job-queue.ts` — Full Implementation

Called from tRPC routers (Next.js process) to enqueue jobs:

```ts
import PgBoss from "pg-boss";
import { env } from "~/env.js";
import { JOB_QUEUES } from "~/lib/job-queues";

type SendOptions = Parameters<PgBoss["send"]>[2];

let bossInstance: PgBoss | null = null;

async function getBoss(): Promise<PgBoss> {
  if (bossInstance) return bossInstance;

  const boss = new PgBoss(env.DATABASE_URL);
  boss.on("error", (err) =>
    console.error("[job-queue] pg-boss error:", err),
  );
  await boss.start();

  // createQueue is idempotent — safe to call on every web server startup
  for (const queue of JOB_QUEUES) {
    await boss.createQueue(queue.name, queue);
  }

  bossInstance = boss;
  return boss;
}

export async function enqueueJob<T extends object>(
  name: JobQueueName,
  payload: T,
  options?: SendOptions,
): Promise<string | null> {
  const boss = await getBoss();
  return boss.send(name, payload, options ?? {});
}
```

**Note:** `bossInstance` is a module-level singleton in the long-running Next.js standalone server process. This is correct for Railway's `output: "standalone"` deployment — the process lives for the server's lifetime.

### `src/worker/index.ts` — Full Implementation

```ts
import PgBoss from "pg-boss";
import { JOB_QUEUES } from "~/lib/job-queues";
import { handleDraftOpen } from "./jobs/draft-open";
import { handleClockExpire } from "./jobs/clock-expire";
import { handleHalftimeCheck } from "./jobs/halftime-check";
import { handleStatsCorrect } from "./jobs/stats-correct";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("[worker] DATABASE_URL not set — exiting");
    process.exit(1);
  }

  const boss = new PgBoss(databaseUrl);
  boss.on("error", (err) => console.error("[worker] pg-boss error:", err));

  await boss.start();
  console.log("[worker] pg-boss started");

  // createQueue MUST be called before work() in pg-boss v10+
  for (const queue of JOB_QUEUES) {
    await boss.createQueue(queue.name, queue);
    console.log(`[worker] queue ready: ${queue.name}`);
  }

  // Register handlers — all stubs for now; implemented in later stories
  await boss.work("draft.open", handleDraftOpen);
  await boss.work("clock.expire", handleClockExpire);
  await boss.work("halftime.check", handleHalftimeCheck);
  await boss.work("stats.correct", handleStatsCorrect);

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
```

### Stub Job Handler Pattern

Each handler receives `job[]` (always an array in pg-boss v10+). Destructure for single-job queues:

```ts
// src/worker/jobs/draft-open.ts
import type { Job } from "pg-boss";

export type DraftOpenPayload = {
  leagueId: string;
  gameId: string;
};

export async function handleDraftOpen(
  jobs: Job<DraftOpenPayload>[],
): Promise<void> {
  const job = jobs[0];
  if (!job) return;
  console.log(
    `[worker] draft.open: leagueId=${job.data.leagueId} gameId=${job.data.gameId}`,
  );
  // Full implementation in Story 3.1 (Draft Order Generation / Draft Window)
}
```

Apply this same pattern for `clock-expire.ts`, `halftime-check.ts`, and `stats-correct.ts` with their own payload types:

```ts
// clock.expire payload (Story 3.9)
type ClockExpirePayload = { pickId: string; leagueId: string; gameId: string };

// halftime.check payload (Story 5.1)
type HalftimeCheckPayload = { gameId: string; leagueId: string };

// stats.correct payload (Story 6.4)
type StatsCorrectPayload = { gameId: string };
```

### Path Alias `~/` Works in the Worker

The worker is run with `tsx` which respects the `tsconfig.json` path aliases (`~/*` → `./src/*`). Imports like `~/lib/job-queues` resolve correctly. tsx uses esbuild internally and handles tsconfig paths automatically.

### Railway Worker Deployment

The `Procfile` was created in Story 1.1 and is already correct. On Railway:

- **Option A (recommended):** Add a second Railway service from the same GitHub repo with start command `npx tsx src/worker/index.ts`. Both services share the same `DATABASE_URL` environment variable.
- **Option B:** Some Railway projects support Procfile-based multi-process via a process manager. The Procfile exists as a fallback for this approach.

For local development: run `pnpm worker:dev` in a separate terminal alongside `pnpm dev`.

### Architecture Anti-Patterns to Avoid

- ❌ Do NOT call pg-boss directly in tRPC routers — always via `src/server/services/job-queue.ts`
- ❌ Do NOT import `src/worker/index.ts` from any Next.js server code
- ❌ Do NOT skip `createQueue()` before `send()` or `work()` — pg-boss v10+ requires it
- ❌ Do NOT use `sendSingleton()` or `sendOnce()` — removed in v10; use `policy: 'stately'` on the queue instead
- ❌ Do NOT use `expireIn: "00:15:00"` string format — use `expireInSeconds: 900` integer
- ❌ Do NOT assume handler receives a single job — always receive `job[]` and destructure

### New Files

- `src/lib/job-queues.ts` *(new — shared queue definitions + JobQueueName type)*
- `src/server/services/job-queue.ts` *(new — pg-boss singleton + enqueueJob for web server)*
- `src/worker/jobs/draft-open.ts` *(new — stub handler)*
- `src/worker/jobs/clock-expire.ts` *(new — stub handler)*
- `src/worker/jobs/halftime-check.ts` *(new — stub handler)*
- `src/worker/jobs/stats-correct.ts` *(new — stub handler)*

### Modified Files

- `src/worker/index.ts` *(replace stub with full pg-boss init)*
- `package.json` *(pg-boss + tsx in deps; worker:dev script)*

### Already Exists — Do NOT Recreate

- `src/worker/` directory *(created in Story 1.1)*
- `src/worker/index.ts` *(stub from Story 1.1 — replace contents)*
- `Procfile` *(created in Story 1.1 — already correct, no changes needed)*

### References

- pg-boss PostgreSQL-backed job queue: [Source: architecture.md#Technical Stack]
- `src/worker/` directory structure: [Source: architecture.md#Complete Project Directory Structure]
- Job naming `domain.action` pattern: [Source: architecture.md#pg-boss Job Naming]
- Job payloads include `leagueId` and `gameId`: [Source: architecture.md#pg-boss Job Payloads]
- `job-queue.ts` as sole exit point for enqueueing: [Source: architecture.md#Service Boundaries]
- pg-boss v12.14.0 latest stable (March 2026): [Source: web research]
- tsx v4.21.0 recommended over ts-node (stale at 10.9.2): [Source: web research]
- Railway: two services from same repo for web + worker: [Source: web research]
- `createQueue()` required before `send()`/`work()` in v10+: [Source: pg-boss v10 release notes]

### Previous Story Learnings (from Story 1.5)

- **Prisma client import**: Always `from "generated/prisma"`, never `from "@prisma/client"` — custom output at `../generated/prisma`. The worker shares the same Prisma client via `src/server/db.ts` if it needs DB access (future story jobs will import `db` from there).
- **`pnpm add <pkg>`**: Adds to production dependencies. `pnpm add -D <pkg>` for dev-only. Use `pnpm add tsx` (no `-D`) to ensure Railway installs it in production.
- **Port**: Dev server runs on 3000 or 3001; worker has no port.
- **Typecheck after every task**: Run `pnpm typecheck` to catch issues early.
- **`src/env.js` uses t3-env with Next.js adapter** — avoid importing it in the worker process; use `process.env.DATABASE_URL` directly.

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- `PgBoss` is a named export in pg-boss v12, not a default export — use `import { PgBoss } from "pg-boss"`. Story Dev Notes showed `import PgBoss from "pg-boss"` which caused TS2613; corrected to named import.
- `boss.on("error", cb)` callback requires explicit `err: unknown` type annotation due to `strict: true` + `noUncheckedIndexedAccess`.
- `worker:dev` script uses `--env-file=.env` flag (Node 20.6+ native) to load `.env` since tsx does not load dotenv automatically. Procfile for production on Railway reads from Railway's injected env vars directly — no `--env-file` needed there.
- Shared queue definitions in `src/lib/job-queues.ts` — imported by both web server and worker. `createQueue()` is idempotent so both processes calling it is safe.
- `notification.send` queue defined in worker but no handler registered (intentional — FCM notifications dispatched from tRPC via `job-queue.ts`; worker receives them via a handler to be added in a future story).

### File List

- `src/lib/job-queues.ts` *(new — shared queue definitions + JobQueueName type)*
- `src/server/services/job-queue.ts` *(new — pg-boss singleton + enqueueJob for web server)*
- `src/worker/index.ts` *(replaced stub with full pg-boss init)*
- `src/worker/jobs/draft-open.ts` *(new — stub handler)*
- `src/worker/jobs/clock-expire.ts` *(new — stub handler)*
- `src/worker/jobs/halftime-check.ts` *(new — stub handler)*
- `src/worker/jobs/stats-correct.ts` *(new — stub handler)*
- `package.json` *(pg-boss + tsx in deps; worker:dev script)*
