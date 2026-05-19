# Story 7.1: Auto-Open Draft Window Before Tipoff

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a commissioner,
I want the draft window to open automatically a configured number of minutes before NBA tipoff,
So that I don't have to remember to manually start each game's draft.

## Acceptance Criteria

### AC1: League-Level Default Offset
**Given** I am a commissioner editing League Settings
**When** I save a `draftOpenOffsetMinutes` value (default for new leagues: **150 minutes**)
**Then** the value is persisted on the League and applied as the default for every Game in the series

### AC2: Per-Game Override on Game Detail Page
**Given** I am viewing the game detail page for an upcoming game
**When** I set a per-game `draftOpenOffsetMinutes` override and save
**Then** that game uses the override instead of the league default
**And** the form renders a live preview in the viewer's local timezone (e.g. *"Draft will open Tuesday at 5:30 PM local time"*)

### AC3: Hard Validation with Formula in Error
**Given** I attempt to save an offset where `offset < participants × clockDurationMinutes + 15`
**When** I submit (League Settings or Game override)
**Then** the save is rejected (server-side + mirrored client-side)
**And** the error message states the minimum legal offset with the formula breakdown — e.g. *"With 5 participants × 30-min clocks + 15-min buffer, set the offset to at least 165 minutes."*

### AC4: Job Enqueue on Schedule Computation
**Given** an upcoming game has both a known NBA tipoff (`NbaGame.gameDate`) and an effective offset
**When** the system computes `scheduledDraftOpenAt = tipoff − offset`
**Then** `Game.scheduledDraftOpenAt` is persisted
**And** a `draft.open` pg-boss job is enqueued with `startAfter = scheduledDraftOpenAt` and `singletonKey = "draft.open:<gameId>"`

### AC5: Idempotent `draft.open` Handler
**Given** the `draft.open` job fires for a game
**When** the game's status is not `pending`
**Then** the handler logs the skip reason and no-ops cleanly (covers manual override, prior fire, double-enqueue)

### AC6: Hourly Reconcile Loop for Tipoff Drift
**Given** there are upcoming games with `scheduledDraftOpenAt` set and status `pending`
**When** the `draft.reconcile` job runs (self-scheduling every 1 hour)
**Then** for each such game it re-resolves tipoff from the NBA schedule
**And** if the new tipoff differs from `scheduledDraftOpenAt + effective_offset` by more than 5 minutes, it recomputes `scheduledDraftOpenAt`, updates `Game.scheduledDraftOpenAt`, and re-enqueues `draft.open` (relies on `singletonKey` to displace the prior schedule)

### AC7: Auto-Bump on Participant Count Change
**Given** a participant joins or leaves a league with upcoming `pending` games
**When** the change makes the effective offset fall below the legal minimum (`participants × clock + 15`) for any such game
**Then** the system writes the new legal minimum to that game's `draftOpenOffsetMinutes`
**And** re-enqueues `draft.open` at the new `scheduledDraftOpenAt`
**And** enqueues a `notification.send` (type `draft-offset-bumped`) to the commissioner explaining the change

### AC8: Countdown Widget on League Home
**Given** a draft is scheduled (`scheduledDraftOpenAt` in the future, status `pending`) and visible to a participant
**When** they view the league home page or game detail page
**Then** a countdown displays *"Next draft opens in 2h 30m"* (or equivalent), updating live without page reload

## Tasks / Subtasks

- [ ] **Task 1: Schema changes** (AC: 1, 2, 4)
  - [ ] Add `draftOpenOffsetMinutes Int @default(150) @map("draft_open_offset_minutes")` to `League` model in `prisma/schema.prisma`
  - [ ] Add `draftOpenOffsetMinutes Int? @map("draft_open_offset_minutes")` (nullable override) to `Game` model
  - [ ] Add `scheduledDraftOpenAt DateTime? @map("scheduled_draft_open_at")` to `Game` model (already have `draftOpensAt`/`draftClosesAt` from Story 3.4 — `scheduledDraftOpenAt` is the *target* set by this system; `draftOpensAt` continues to record the actual open time set by the `draft.open` handler)
  - [ ] Run `pnpm prisma db push` (Railway migration drift — do NOT use `migrate dev`; same note as Story 3.3)
  - [ ] Re-run `pnpm prisma generate`

- [ ] **Task 2: Validation helper** (AC: 3, 7)
  - [ ] New `src/server/services/draft-open-schedule.ts` exporting:
    - `minLegalOffsetMinutes(participantCount: number, clockDurationMinutes: number): number` — returns `participantCount * clockDurationMinutes + 15`
    - `validateOffset(participants, clock, offset): { ok: true } | { ok: false; minRequired: number; message: string }` — returns the user-facing error message including the formula breakdown
    - `effectiveOffset(game: { draftOpenOffsetMinutes: number | null }, league: { draftOpenOffsetMinutes: number }): number` — game override wins over league default
    - `computeScheduledDraftOpenAt(tipoffUTC: Date, offsetMinutes: number): Date`
  - [ ] Unit tests for each (file: `src/server/services/draft-open-schedule.test.ts`)

- [ ] **Task 3: League Settings — update default offset** (AC: 1, 3)
  - [ ] Add `updateLeagueSettings` mutation to `src/server/api/routers/league.ts`: input `{ leagueId, draftOpenOffsetMinutes }`, commissioner-only, validates against `minLegalOffsetMinutes` using current participant count + league.clockDurationMinutes, throws `BAD_REQUEST` with the formula message on fail
  - [ ] On success: rescheduleAllPendingGames helper (Task 5) is called so existing pending games pick up the new default
  - [ ] Surface the new field in the League Settings UI (`src/components/league/LeagueSettings.tsx` — or equivalent; check existing patterns) with inline validation that calls the same helper client-side
  - [ ] Show the minimum legal value as helper text below the field

- [ ] **Task 4: Game Detail — per-game override + preview** (AC: 2, 3)
  - [ ] Add `updateGameDraftOffset` mutation to `src/server/api/routers/draft.ts` (or `game.ts`): input `{ gameId, draftOpenOffsetMinutes: number | null }`, commissioner-only, validates with same helper, clears + re-enqueues `draft.open` job on success (Task 5)
  - [ ] On the game detail page (`src/app/league/[leagueId]/game/[gameId]/page.tsx` if exists, else add), render the override field with the live local-timezone preview below it
  - [ ] Preview formula: `tipoff − effective_offset`, formatted with `Intl.DateTimeFormat(undefined, { weekday: "long", hour: "numeric", minute: "2-digit", timeZoneName: "short" })`

- [ ] **Task 5: Schedule + re-enqueue service** (AC: 4, 6, 7)
  - [ ] Extend `src/server/services/draft-open-schedule.ts` with:
    - `scheduleDraftOpen(db, gameId)`: loads game + league + nbaGame, computes `scheduledDraftOpenAt`, persists it on Game, enqueues `draft.open` with `startAfter` and `singletonKey: "draft.open:<gameId>"`. If tipoff isn't known yet, persists nothing and logs a skip. Idempotent — safe to call repeatedly.
    - `rescheduleAllPendingGames(db, leagueId)`: iterates pending games for the league, calls `scheduleDraftOpen` for each. Used after league offset change.
  - [ ] Wire `scheduleDraftOpen` into the existing `createNextGame` / `autoGenerateProvisionalNext` paths in `src/server/services/draft-order.ts` so newly-created games schedule themselves the moment tipoff is known

- [ ] **Task 6: Idempotent `draft.open` handler** (AC: 5)
  - [ ] In `src/worker/jobs/draft-open.ts`, at the top of `handleDraftOpen`, load the game; if `game.status !== "pending"`, log and return early
  - [ ] Add tests in `src/worker/jobs/draft-open.test.ts` (create if missing) for: (a) happy-path opens, (b) status=`draft-open` is no-op, (c) status=`active` is no-op, (d) status=`final` is no-op
  - [ ] Ensure `singletonKey` is honored by the existing pg-boss config — `JOB_QUEUES` entry for `draft.open` may need `singletonKey` support; verify in `src/lib/job-queues.ts`

- [ ] **Task 7: New `draft.reconcile` job + handler** (AC: 6)
  - [ ] Add new entry to `JOB_QUEUES` in `src/lib/job-queues.ts`: `{ name: "draft.reconcile", retryLimit: 2, retryDelay: 60, retryBackoff: true, expireInSeconds: 300, deleteAfterSeconds: 86400 }`
  - [ ] Create `src/worker/jobs/draft-reconcile.ts`: self-scheduling handler that runs every 1 hour. For each pending game with `scheduledDraftOpenAt` set, re-resolves tipoff via `nbaStatsService.getNextSeriesGame()` (or check existing `NbaGame.gameDate` after a refresh), and if drift > 5 min, calls `scheduleDraftOpen` to recompute + re-enqueue
  - [ ] Register handler in `src/worker/index.ts`
  - [ ] Enqueue the initial `draft.reconcile` job at worker startup (similar to how scores.poll self-bootstraps; see `src/worker/index.ts`)
  - [ ] Tests in `src/worker/jobs/draft-reconcile.test.ts` covering: (a) no drift → no re-enqueue, (b) tipoff moved 10 min later → re-enqueue, (c) game already opened → skip, (d) tipoff missing → skip

- [ ] **Task 8: Auto-bump on participant join/leave** (AC: 7)
  - [ ] In `src/server/api/routers/league.ts` `joinLeague` mutation: after the participant is created, call a new helper `revalidateOffsetsForLeague(db, leagueId)` which iterates pending games. For each game whose effective offset falls short of `minLegalOffsetMinutes(newParticipantCount, league.clockDurationMinutes)`, write the new minimum to `Game.draftOpenOffsetMinutes`, call `scheduleDraftOpen`, and enqueue a `notification.send` to the commissioner
  - [ ] Add a `leaveLeague` mutation if not already present (check `league.ts`); on leave, call the same helper (leaving lowers the participant count, so the bump direction is the opposite — but the same min-legal recheck handles both)
  - [ ] Notification payload type `draft-offset-bumped` — add to the notification type union (search for `"game-results"` in `src/worker/jobs/notification-send.ts` for the existing pattern)
  - [ ] Tests in `src/server/services/draft-open-schedule.test.ts` for the revalidate path

- [ ] **Task 9: Countdown widget** (AC: 8)
  - [ ] Add a client component `src/components/league/NextDraftCountdown.tsx` that takes `scheduledDraftOpenAt: Date` and renders a live countdown using `setInterval` (1s tick) — format: `"Opens in 2h 30m"` or `"Opens in 12m"` based on magnitude
  - [ ] Embed on the league home page (`src/app/league/[leagueId]/page.tsx`) when the next upcoming game has `scheduledDraftOpenAt` set and status `pending`
  - [ ] Also embed on the game detail page near the override field
  - [ ] When countdown reaches 0, swap to "Draft is opening…" placeholder; the page should auto-refresh via existing tRPC invalidation when status flips to `draft-open`

- [ ] **Task 10: tRPC + page wiring** (AC: 1, 2, 4, 8)
  - [ ] Extend the existing league `getLeague` (or add a thin `getLeagueDraftSchedule`) to return per-game `{ gameId, gameNumber, tipoff: NbaGame.gameDate, scheduledDraftOpenAt, effectiveOffsetMinutes, status }` for the upcoming-games list used by the countdown widget + game detail page
  - [ ] No new server context needed — uses existing `commissionerProcedure` / `protectedProcedure` guards

## Dev Notes

### Architecture

- **Schedule source**: `NbaGame.gameDate` (UTC) is populated by `populate-series.ts` from the NBA static schedule when the series is created, and refreshed by the `draft.reconcile` loop. Tipoff is the canonical anchor — never store wall-clock times directly on Game.
- **pg-boss singleton key**: `"draft.open:<gameId>"` ensures re-enqueueing for the same game displaces the prior job rather than creating a duplicate. Verify your `enqueueJob()` wrapper supports `singletonKey` (it should — check `src/server/services/job-queue.ts`).
- **Validation buffer (15 min)**: hardcoded for now. If a config knob is needed later, add a `DRAFT_TIPOFF_BUFFER_MINUTES` constant in `src/lib/constants.ts`.
- **Order of operations for `draft.reconcile`**: re-resolve tipoff BEFORE checking drift. The reconcile loop is the only place we re-fetch tipoff — the user-facing UI just reads `NbaGame.gameDate`.

### Existing Infrastructure to Reuse

| What | Where | Notes |
|------|-------|-------|
| `enqueueJob()` | `src/server/services/job-queue.ts` | Supports `startAfter`; verify `singletonKey` support |
| `JOB_QUEUES` | `src/lib/job-queues.ts` | Add `draft.reconcile` here |
| `nbaStatsService.getNextSeriesGame()` | `src/server/services/nba-stats.ts` | Resolves a future NBA gameId from the cached schedule (3.1 + 7.3) |
| `nbaStatsService.getCachedSchedule()` | `src/server/services/nba-stats.ts` | 1-hour cache; reconcile loop benefits from this |
| `getPlayoffSeries(db, seriesId)` | `src/server/services/playoff-series.ts` | Schedule-derived series catalog (5/18 refactor); used when looking up team metadata |
| `openDraftWindow()` (handler logic) | `src/server/services/draft-window.ts:339` | Existing manual-open path; the auto-open job calls this same code via `src/worker/jobs/draft-open.ts` |
| `commissionerProcedure` | `src/server/api/trpc.ts` | tRPC middleware for commissioner-only mutations |
| `enforceLeagueCommissioner` | `src/server/api/helpers.ts` | Auth guard for cross-cutting checks |
| `notification.send` pattern | `src/worker/jobs/notification-send.ts` | Add `draft-offset-bumped` to the type union |
| Self-scheduling loop pattern | `src/worker/jobs/scores-poll.ts:273-281` | `draft.reconcile` mirrors this `scheduleNext()` shape |
| Worker registration | `src/worker/index.ts` | Add new handler registration |

### Testing Notes

- **Unit-pure**: `minLegalOffsetMinutes`, `validateOffset`, `effectiveOffset`, `computeScheduledDraftOpenAt` — straight Vitest, no DB.
- **DB-touching**: `scheduleDraftOpen`, `rescheduleAllPendingGames`, `revalidateOffsetsForLeague` — use existing Prisma test-DB pattern (see `src/server/services/draft-order.test.ts`).
- **Worker handlers**: existing tests in `src/worker/jobs/*.test.ts` use a mocked `Job` payload; follow that.
- **Edge: tipoff TBD**: NBA's schedule sometimes shows `"TBD"` for round-progression games (we saw this with WCF Game 7). `NbaGame.gameDate` will be null/sentinel — `scheduleDraftOpen` MUST skip gracefully and let `draft.reconcile` pick it up later when tipoff resolves.
- **Edge: participant joins after draft already opened**: status is no longer `pending`, so the revalidate helper should treat it as a no-op (don't bump an in-progress draft).
- **Edge: game already manually opened** (commissioner clicked "Open Draft Window"): status flipped to `draft-open` → `draft.open` job no-ops via AC5 → reconcile leaves it alone.

### Project Structure Notes

- New service file: `src/server/services/draft-open-schedule.ts`
- New worker handler: `src/worker/jobs/draft-reconcile.ts`
- New component: `src/components/league/NextDraftCountdown.tsx`
- New test files: `src/server/services/draft-open-schedule.test.ts`, `src/worker/jobs/draft-reconcile.test.ts`, `src/worker/jobs/draft-open.test.ts` (if not already present)
- Schema additions are additive only; existing `Game.draftOpensAt` / `Game.draftClosesAt` from Story 3.4 are untouched

### References

- [Source: planning-artifacts/epics.md#Story 7.1] — acceptance criteria
- [Source: implementation-artifacts/3-4-draft-window-and-selection-clock.md] — existing draft window service, `draft.open` handler, clock model, `db push` note
- [Source: implementation-artifacts/3-3-draft-order-generation.md] — draft order auto-generation, ties into `autoGenerateProvisionalNext` flow
- [Source: src/lib/job-queues.ts] — pg-boss queue definitions
- [Source: src/worker/index.ts] — worker handler registration pattern
- [Source: src/worker/jobs/scores-poll.ts] — self-scheduling loop pattern to mirror for `draft.reconcile`
- [Source: src/server/services/draft-window.ts] — existing `openDraftWindow`, `getDraftStatus`
- [Source: src/server/services/draft-order.ts] — `autoGenerateProvisionalNext` (existing hook point for new-game scheduling)
- [Source: src/server/services/nba-stats.ts] — `getNextSeriesGame`, `getCachedSchedule`
- [Source: src/server/services/playoff-series.ts] — schedule-derived series catalog (5/18)
- [Source: prisma/schema.prisma] — Game / League / NbaGame models
- [Source: src/server/api/routers/league.ts] — `joinLeague` mutation, where the participant-change hook attaches

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
