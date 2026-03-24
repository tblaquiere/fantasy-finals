# Story 3.4: Draft Window & Selection Clock

Status: complete

## Story

As a participant,
I want the draft window to open automatically at 9am PST the morning after a game with sequential 1-hour clocks,
so that I have the whole morning to make my pick without anyone chasing me down.

## Acceptance Criteria

### AC1: Draft Order Publish Job
**Given** a game has concluded and final scores are confirmed
**When** the `draft.order-publish` pg-boss job fires (scheduled 30 minutes after final score confirmation)
**Then** the draft order for the next game is published and all participants receive a push notification

### AC2: Draft Window Auto-Open at 9am PST
**Given** draft order has been published
**When** 9am PST arrives the following morning
**Then** the `draft.open` pg-boss job fires, the draft window opens automatically, and the first participant's selection clock starts

### AC3: Draft Open Retry on Failure
**Given** the `draft.open` job fails or does not fire at 9am PST
**When** the system detects the job missed its schedule (via pg-boss retry)
**Then** the job retries automatically and the window opens as soon as the retry succeeds
**And** the commissioner is not required to manually intervene

### AC4: Clock Advances on Pick Submission
**Given** a participant's selection clock is running
**When** they submit their pick
**Then** the clock stops and the next participant's clock starts immediately

### AC5: Draft Window Closes at Tip-Off
**Given** the draft window is open
**When** the next game's tip-off time is reached
**Then** the draft window closes and no further picks are accepted

## Tasks / Subtasks

- [x] Task 1: Schema changes (AC: 1, 2, 4, 5)
  - [x] Add `draftOpensAt DateTime?` and `draftClosesAt DateTime?` to `Game` model
  - [x] Add `clockStartsAt DateTime?` and `clockExpiresAt DateTime?` to `DraftSlot` model
  - [x] Run `pnpm prisma db push` then `pnpm prisma generate`

- [x] Task 2: Add `draft.order-publish` job queue (AC: 1)
  - [x] Add queue definition to `src/lib/job-queues.ts` (retryLimit: 3, retryDelay: 30, backoff: true, expire: 300s)
  - [x] Create `src/worker/jobs/draft-order-publish.ts` handler
  - [x] Register handler in `src/worker/index.ts`

- [x] Task 3: Implement `draft.order-publish` handler (AC: 1)
  - [x] Handler receives `{ leagueId, nbaGameId }` payload
  - [x] Calls existing `generateDraftOrder` logic (reuse `calcDraftOrder` + DB transaction from draft router)
  - [x] Calculates `draftOpensAt` = next day 9am PST, `draftClosesAt` = next game tip-off time
  - [x] Sets these timestamps on the Game record
  - [x] Schedules `draft.open` job with `startAfter` = `draftOpensAt`
  - [x] Enqueues `notification.send` for all participants with draft order info

- [x] Task 4: Implement `draft.open` handler (AC: 2, 3)
  - [x] Replace stub in `src/worker/jobs/draft-open.ts`
  - [x] Handler receives `{ leagueId, gameId }` payload
  - [x] Updates Game status from `pending` to `draft-open`
  - [x] Loads DraftSlots ordered by `pickPosition ASC`
  - [x] Sets `clockStartsAt = now()` and `clockExpiresAt = now() + league.clockDurationMinutes` on first DraftSlot (pickPosition=1)
  - [x] Enqueues `clock.expire` job with `startAfter` = `clockExpiresAt` for the first slot
  - [x] pg-boss retry config (already 3 retries, 30s backoff) handles AC3
  - [x] Updated clock.expire payload: pickId → slotId

- [x] Task 5: Draft window service — `src/server/services/draft-window.ts` (AC: 2, 4, 5)
  - [x] `advanceClock(gameId, completedSlotId)`: stops current clock, starts next participant's clock, enqueues `clock.expire` for new slot. Returns the new active slot or null if all picks done.
  - [x] `closeDraftWindow(gameId)`: sets Game status to `active`, clears any running clocks. Called when tip-off reached.
  - [x] `getDraftStatus(gameId)`: returns current game status, active slot (whose turn), clock expiry time, remaining slots.
  - [x] `openDraftWindow(gameId)`: commissioner fallback to manually open draft

- [x] Task 6: tRPC procedures (AC: 2, 4, 5)
  - [x] `draft.getDraftStatus` — protectedProcedure, returns draft window state (open/closed, whose turn, clock countdown, all slots with status)
  - [x] `draft.openDraftWindow` — commissionerProcedure, manual fallback to open draft if job fails (sets status, starts first clock)
  - [x] `draft.closeDraftWindow` — commissionerProcedure, manual fallback to close draft
  - [x] Update `draft.getDraftOrder` to include clock timestamps

- [x] Task 7: Tests (AC: 1-5)
  - [x] `draft-window.test.ts` — calcDraftOpenTime timezone tests, clock math tests (6 tests pass)
  - [x] Existing draft-order tests confirmed passing after refactor (12 tests pass)
  - [x] Full test suite: 85 tests, 11 files, all passing

## Dev Notes

### Schema Additions

Add to existing `Game` model in `prisma/schema.prisma`:

```prisma
  draftOpensAt  DateTime? @map("draft_opens_at")
  draftClosesAt DateTime? @map("draft_closes_at")
```

Add to existing `DraftSlot` model:

```prisma
  clockStartsAt  DateTime? @map("clock_starts_at")
  clockExpiresAt DateTime? @map("clock_expires_at")
```

Use `pnpm prisma db push` (NOT `migrate dev`) due to Railway migration drift.

### Clock Duration

`League.clockDurationMinutes` already exists in schema (set at league creation). Use this value when computing `clockExpiresAt`. The constant `MAX_CLOCK_MINUTES = 60` in `src/lib/constants.ts` caps this.

### 9am PST Scheduling

When scheduling `draft.open`, compute the target time in America/Los_Angeles timezone:
```typescript
// Next day at 9am PST/PDT
const nextDay = new Date(gameEndTime);
nextDay.setDate(nextDay.getDate() + 1);
// Use Intl or a simple UTC offset calculation for PST (-8) / PDT (-7)
// The app runs on Railway (UTC) so always convert explicitly
```

pg-boss `startAfter` accepts a Date — use it to schedule the `draft.open` job for 9am PST.

### Job Payload Types

```typescript
// draft-order-publish.ts
export type DraftOrderPublishPayload = {
  leagueId: string;
  nbaGameId: string;  // the NEXT game to draft for
};

// draft-open.ts (already defined, reuse)
export type DraftOpenPayload = {
  leagueId: string;
  gameId: string;
};

// clock-expire.ts (already defined) — uses DraftSlot id, not Pick id
// Update payload: pickId → slotId since Pick model doesn't exist yet
export type ClockExpirePayload = {
  slotId: string;   // DraftSlot id (rename from pickId)
  leagueId: string;
  gameId: string;
};
```

**Important:** The existing `ClockExpirePayload` uses `pickId` but the `Pick` model doesn't exist yet (Story 3.6). Change it to `slotId` (DraftSlot id) for now. Story 3.6 can adjust if needed.

### Reuse Pattern for Draft Order Generation

The `draft.order-publish` handler needs the same logic as `draftRouter.generateDraftOrder`. Extract the core DB transaction logic into a shared service function in `src/server/services/draft-order.ts`:

```typescript
export async function generateAndPersistDraftOrder(
  db: PrismaClient,
  leagueId: string,
  nbaGameId: string,
): Promise<{ gameId: string; gameNumber: number }>
```

Then both the tRPC procedure and the job handler call this function. Do NOT duplicate the transaction logic.

### Game Status Transitions (this story)

```
pending → draft-open    (draft.open handler fires)
draft-open → active     (tip-off reached / closeDraftWindow)
```

The `pending → draft-open` transition happens in the `draft.open` handler.
The `draft-open → active` transition happens when tip-off is reached (AC5).

### Draft Window Close Trigger

AC5 says the window closes at tip-off. For this story, implement `closeDraftWindow` as a callable service function. The actual trigger (detecting tip-off) will be wired in Story 4.1 (Quarterly Score Updates) when the game status polling job exists. For now:
- Add a `draft.closeDraftWindow` commissionerProcedure as a manual fallback
- The service function should be ready to be called from a future job handler

### What This Story Does NOT Include

- Pick submission UI or API (Story 3.6)
- Auto-assign logic when clock expires (Story 3.9 — `clock.expire` handler remains a stub for auto-assign, but this story enqueues the job)
- Push notification dispatch (Story 3.11 — `notification.send` remains a stub, but this story enqueues the job)
- The `Pick` model (Story 3.6)
- Detecting game conclusion / final scores (Story 4.1)
- Real-time draft feed (Story 3.7)

### Existing Infrastructure to Reuse

| What | Where | Notes |
|------|-------|-------|
| `enqueueJob()` | `src/server/services/job-queue.ts` | Enqueue any pg-boss job from web or worker |
| `JOB_QUEUES` | `src/lib/job-queues.ts` | Add `draft.order-publish` here |
| `calcDraftOrder()` | `src/server/services/draft-order.ts` | Pure function for ordering |
| `enforceLeagueCommissioner` | `src/server/api/helpers.ts` | Auth guard |
| `enforceLeagueMember` | `src/server/api/helpers.ts` | Auth guard |
| `commissionerProcedure` | `src/server/api/trpc.ts` | tRPC middleware |
| Worker registration | `src/worker/index.ts` | Add new handler registration |
| `CLOCK_DURATION_OPTIONS` | `src/lib/constants.ts` | Valid clock durations |
| `MAX_CLOCK_MINUTES` | `src/lib/constants.ts` | Cap for clock duration |

### Testing Notes

- `advanceClock` and `closeDraftWindow` need database interaction — use Prisma with a test database or mock `ctx.db` consistently with the pattern from Story 3.3
- Job handler tests should verify correct jobs are enqueued with correct `startAfter` timestamps
- Clock math tests: verify `clockExpiresAt = clockStartsAt + clockDurationMinutes`
- Edge case: last participant's clock — `advanceClock` should return null and not enqueue another `clock.expire`
- Edge case: `closeDraftWindow` called while a clock is running — should clear the clock

### Project Structure Notes

- New files follow existing patterns: services in `src/server/services/`, job handlers in `src/worker/jobs/`
- Job handler file naming: kebab-case matching queue name (`draft-order-publish.ts` for `draft.order-publish`)
- All Prisma fields use camelCase with `@map("snake_case")`

### References

- [Source: planning-artifacts/epics.md#Story 3.4] — acceptance criteria
- [Source: planning-artifacts/architecture.md#Background Jobs] — pg-boss patterns
- [Source: implementation-artifacts/3-3-draft-order-generation.md] — draft order service, schema patterns, `db push` note
- [Source: src/lib/job-queues.ts] — existing queue definitions
- [Source: src/worker/index.ts] — worker handler registration pattern
- [Source: src/server/services/job-queue.ts] — `enqueueJob()` API
- [Source: src/lib/constants.ts] — clock duration constants
- [Source: prisma/schema.prisma] — Game.status values, DraftSlot model

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
