# Story 7.1: Auto-Open Draft Window Before Tipoff

Status: done

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
**Given** I attempt to save an offset where `offset < participants × clockDurationMinutes + DRAFT_TIPOFF_BUFFER_MINUTES`
**When** I submit (League Settings or Game override)
**Then** the save is rejected (server-side, with client-side mirror for UX)
**And** the error message states the minimum legal offset with the formula breakdown — e.g. *"With 5 participants × 30-min clocks + 15-min buffer, set the offset to at least 165 minutes."*

### AC4: Modify `calcDraftOpenTime` — Tipoff-Relative Instead of 9am PST
**Given** an upcoming game has both a known NBA tipoff (`NbaGame.gameDate`) and an effective offset
**When** the existing `draft.order-publish` handler runs (after the prior game finalizes) or `autoGenerateProvisionalNext` creates a new Game
**Then** `calcDraftOpenTime(tipoff, effectiveOffsetMinutes)` returns `tipoff − offset`
**And** `Game.draftOpensAt` is persisted with that value
**And** a `draft.open` pg-boss job is enqueued with `startAfter = draftOpensAt` and `singletonKey = "draft.open:<gameId>"`

### AC5: Idempotent `draft.open` Handler
**Given** the `draft.open` job fires for a game
**When** the game's status is not `pending`
**Then** the handler logs the skip reason and no-ops cleanly (covers manual override, prior fire, double-enqueue)

### AC6: Hourly Reconcile Loop for Tipoff Drift
**Given** there are upcoming games with `draftOpensAt` set and status `pending`
**When** the `draft.reconcile` job runs (self-scheduling every 1 hour)
**Then** for each such game it re-resolves tipoff from the NBA schedule
**And** if the new tipoff differs from `draftOpensAt + effective_offset` by more than 5 minutes, it recomputes `draftOpensAt`, updates the Game, and re-enqueues `draft.open` (cancelling the prior queued job first — see Task 6 note on pg-boss singletonKey semantics)

### AC7: Auto-Bump on Participant Count Change
**Given** a participant joins or leaves a league with upcoming `pending` games
**When** the change makes the effective offset fall below the legal minimum (`participants × clock + DRAFT_TIPOFF_BUFFER_MINUTES`) for any such game
**Then** the system writes the new legal minimum to that game's `draftOpenOffsetMinutes`
**And** re-enqueues `draft.open` at the new `draftOpensAt`
**And** enqueues a `notification.send` (type `draft-offset-bumped`) to the commissioner explaining the change

### AC8: Countdown Widget on League Home and Game Detail
**Given** a draft is scheduled (`draftOpensAt` in the future, status `pending`) and visible to a participant
**When** they view the league home page or game detail page
**Then** a countdown displays *"Next draft opens in 2h 30m"* (or equivalent), updating live without page reload
**And** when the countdown reaches 0, it swaps to "*Draft is opening shortly…*" until status flips to `draft-open`

## Tasks / Subtasks

- [x] **Task 1: Constants + schema** (AC: 1, 2, 3, 4)
  - [x] Add `DRAFT_TIPOFF_BUFFER_MINUTES = 15` to `src/lib/constants.ts` (matches the `MOZGOV_THRESHOLD_MINUTES` pattern)
  - [x] Add `draftOpenOffsetMinutes Int @default(150) @map("draft_open_offset_minutes")` to `League` in `prisma/schema.prisma`
  - [x] Add `draftOpenOffsetMinutes Int? @map("draft_open_offset_minutes")` (nullable override) to `Game`
  - [x] **Reuse the existing `Game.draftOpensAt`** field from Story 3.4 as the scheduled open time — do NOT add a parallel `scheduledDraftOpenAt` column
  - [x] Run `pnpm prisma db push` (Railway migration drift — do NOT use `migrate dev`; same note as Story 3.3)
  - [x] Re-run `pnpm prisma generate`

- [x] **Task 2: Validation + offset-resolution service** (AC: 3, 7)
  - [x] New `src/server/services/draft-open-schedule.ts` exporting:
    - `minLegalOffsetMinutes(participantCount: number, clockDurationMinutes: number): number` — returns `participantCount * clockDurationMinutes + DRAFT_TIPOFF_BUFFER_MINUTES`
    - `validateOffset(participants, clock, offset): { ok: true } | { ok: false; minRequired: number; message: string }` — returns the user-facing error message including the formula breakdown
    - `effectiveOffset(game: { draftOpenOffsetMinutes: number | null }, league: { draftOpenOffsetMinutes: number }): number` — game override wins over league default
    - `revalidateOffsetsForLeague(db, leagueId): Promise<{ bumpedGameIds: string[] }>` — used by AC7; iterates pending games, auto-bumps any whose effective offset is below the new min, persists, re-enqueues `draft.open`, enqueues commissioner notification
    - `rescheduleAllPendingGames(db, leagueId): Promise<void>` — iterates pending games, recomputes `draftOpensAt` via the modified `calcDraftOpenTime`, persists, re-enqueues. Used after League settings change.
  - [x] Unit tests for the pure helpers in `src/server/services/draft-open-schedule.test.ts`
  - [x] **Do not** add a time-computation helper here — that logic lives in `calcDraftOpenTime` (modified in Task 5)

- [x] **Task 3: League Settings — update default offset** (AC: 1, 3)
  - [x] Add `updateLeagueSettings` mutation to `src/server/api/routers/league.ts`: input `{ leagueId, draftOpenOffsetMinutes }`, commissioner-only, calls `validateOffset` with current participant count + `league.clockDurationMinutes`, throws `BAD_REQUEST` with the formula message on fail
  - [x] On success: call `rescheduleAllPendingGames(db, leagueId)` so existing pending games pick up the new default
  - [x] Surface the new field in the League Settings UI (`src/components/league/LeagueSettings.tsx` — or whatever the existing settings component is; grep first) with inline validation that mirrors `validateOffset` client-side
  - [x] Show the minimum legal value as helper text below the field

- [x] **Task 4: Game Detail — per-game override + preview** (AC: 2, 3)
  - [x] Add `updateGameDraftOffset` mutation to `src/server/api/routers/draft.ts` (or `game.ts`): input `{ gameId, draftOpenOffsetMinutes: number | null }`, commissioner-only, validates with the same helper, persists, and re-runs `calcDraftOpenTime` + re-enqueues `draft.open` (delete the prior queued job first — see Task 6 note)
  - [x] On `src/app/league/[leagueId]/game/[gameId]/page.tsx`, render the override field with the live local-timezone preview below it
  - [x] Preview formula: `tipoff − effective_offset`, formatted with `Intl.DateTimeFormat(undefined, { weekday: "long", hour: "numeric", minute: "2-digit", timeZoneName: "short" })`

- [x] **Task 5: Modify the existing auto-open path** (AC: 4)
  - [x] **MODIFY** `src/worker/jobs/draft-order-publish.ts`:
    - Change `calcDraftOpenTime` signature to `calcDraftOpenTime(tipoffUTC: Date, offsetMinutes: number): Date` and have it return `new Date(tipoffUTC.getTime() - offsetMinutes * 60_000)`. Drop the existing 9am PST / `Intl.DateTimeFormat` logic entirely.
    - In the handler body, load `League.draftOpenOffsetMinutes` + the new `Game.draftOpenOffsetMinutes`, derive `effectiveOffset`, fetch `NbaGame.gameDate` (the `tipOffTime` payload field already carries tipoff — use it directly), then call the new `calcDraftOpenTime(tipoff, effective)`
    - If tipoff is unknown, persist nothing for `draftOpensAt` and log; `draft.reconcile` (Task 7) will pick it up when tipoff resolves
    - Existing tests on this handler will break — update them
  - [x] **MODIFY** `src/server/services/draft-order.ts` `autoGenerateProvisionalNext`: after the new Game is created, mirror the same logic (compute `draftOpensAt`, persist, enqueue `draft.open` with the singleton key). This is the other path that creates Games and was not previously setting `draftOpensAt`.
  - [x] No new `scheduleDraftOpen` service needed — the modified `calcDraftOpenTime` + the two call sites above ARE the schedule mechanism

- [x] **Task 6: Idempotent `draft.open` handler + singletonKey re-enqueue semantics** (AC: 5)
  - [x] In `src/worker/jobs/draft-open.ts`, at the top of `handleDraftOpen`, load the game; if `game.status !== "pending"`, log a clear skip line (e.g. `[worker] draft.open: skipping <gameId>, status=<status>`) and return early
  - [x] Add tests in `src/worker/jobs/draft-open.test.ts` (create if missing) for: (a) happy-path opens, (b) status=`draft-open` is no-op, (c) status=`active` is no-op, (d) status=`final` is no-op
  - [x] **pg-boss singletonKey nuance:** by default, `boss.send(name, payload, { singletonKey })` REJECTS duplicate enqueues with the same key — it does NOT replace the prior job. To "re-schedule" the same game, the caller must either:
    - (a) Delete the prior queued job for that game first via `boss.cancel()` or `boss.complete()`, OR
    - (b) Use `singletonHours` / `singletonMinutes` with `useSingletonQueue: true` (different semantics — read pg-boss docs)
  - [x] Recommend (a): in the helper that re-enqueues (used by Tasks 4, 5, 7, 8), first call `boss.deleteQueue` filtered by the singletonKey, then enqueue. Encapsulate this in a small `replaceJob(name, key, payload, options)` helper in `src/server/services/job-queue.ts` so the pattern is reusable
  - [x] The `JOB_QUEUES` entry for `draft.open` in `src/lib/job-queues.ts` does not need changes (singletonKey is a per-send option, not a queue config)

- [x] **Task 7: New `draft.reconcile` queue + handler + bootstrap** (AC: 6)
  - [x] Add new entry to `JOB_QUEUES` in `src/lib/job-queues.ts`: `{ name: "draft.reconcile", retryLimit: 2, retryDelay: 60, retryBackoff: true, expireInSeconds: 300, deleteAfterSeconds: 86400 }`
  - [x] Create `src/worker/jobs/draft-reconcile.ts`. Empty payload. Pattern:
    1. Find all `pending` games with `draftOpensAt` set and tipoff in the future
    2. For each, re-fetch tipoff via `nbaStatsService.getCachedSchedule()` (1-hour cache, so this is cheap)
    3. Compute `newDraftOpensAt = tipoff − effectiveOffset`. If `|newDraftOpensAt − currentDraftOpensAt| > 5 min`, persist new value and call `replaceJob("draft.open", "draft.open:<gameId>", { leagueId, gameId }, { startAfter: newDraftOpensAt })`
    4. At end, self-schedule the next reconcile: `enqueueJob("draft.reconcile", {}, { startAfter: new Date(Date.now() + 60 * 60 * 1000), singletonKey: "draft.reconcile:singleton" })`
  - [x] Register handler in `src/worker/index.ts`
  - [x] **Bootstrap on worker startup:** after handler registration in `src/worker/index.ts`, add `await enqueueJob("draft.reconcile", {}, { startAfter: new Date(Date.now() + 60_000), singletonKey: "draft.reconcile:singleton" })`. The singletonKey makes the bootstrap idempotent — restart-loops won't queue duplicates.
  - [x] Tests in `src/worker/jobs/draft-reconcile.test.ts` covering: (a) no drift → no re-enqueue, (b) tipoff moved 10 min later → persists new `draftOpensAt` + replaces job, (c) game already opened → skip, (d) tipoff missing on `NbaGame` → skip and log

- [x] **Task 8: Auto-bump on participant join/leave** (AC: 7)
  - [x] In `src/server/api/routers/league.ts` `joinLeague` mutation: after the participant is created, call `revalidateOffsetsForLeague(db, leagueId)` from the schedule service
  - [x] Add a `leaveLeague` mutation in `src/server/api/routers/league.ts` (does not exist yet — check first to confirm). Same shape as join. After deleting the participant, call the same revalidate helper.
  - [x] Notification payload type `draft-offset-bumped` — add to the handler map in `src/worker/jobs/notification-send.ts` (existing types are `game-results`, `mozgov-triggered`, `draft-order-provisional`). The message should include the new offset and an explanation: *"Participant count changed. Game N's draft offset was auto-adjusted to X minutes so every picker can finish before tipoff."*
  - [x] Tests in `src/server/services/draft-open-schedule.test.ts` for `revalidateOffsetsForLeague`: (a) participant joins and bumps a game, (b) participant leaves but no game is invalid → no-op, (c) game already `draft-open` → skip (don't bump in-progress drafts)

- [x] **Task 9: Countdown widget** (AC: 8)
  - [x] Add a client component `src/components/league/NextDraftCountdown.tsx` that takes `draftOpensAt: Date` and renders a live countdown using a `setInterval(1000)` — format: `"Opens in 2h 30m"` or `"Opens in 12m"` based on magnitude. When `draftOpensAt − now ≤ 0`, render `"Draft is opening shortly…"`.
  - [x] Embed on the league home page (`src/app/league/[leagueId]/page.tsx`) when the next upcoming game has `draftOpensAt` set and status `pending`
  - [x] Also embed on the game detail page near the override field
  - [x] Use existing tRPC invalidation (`useUtils()` + `invalidate()`) when status flips to `draft-open` so the page swaps to the live draft view automatically

- [x] **Task 10: tRPC + page wiring** (AC: 1, 2, 4, 8)
  - [x] Extend the existing league `getLeague` (or add a thin `getLeagueDraftSchedule`) to return per-game `{ gameId, gameNumber, tipoff: NbaGame.gameDate, draftOpensAt, effectiveOffsetMinutes, status }` for the upcoming-games list used by the countdown widget + game detail page
  - [x] No new server context needed — uses existing `commissionerProcedure` / `protectedProcedure` guards

## Dev Notes

### Architecture

- **Single field for scheduled open time**: `Game.draftOpensAt` (existing, from Story 3.4) is THE scheduled open time. The new logic computes it via `calcDraftOpenTime(tipoff, offset)`. Do not add a parallel column.
- **Schedule source**: `NbaGame.gameDate` (UTC) is populated by `populate-series.ts` from the NBA static schedule when the series is created, and refreshed by the `draft.reconcile` loop reading `nbaStatsService.getCachedSchedule()` (1-hour TTL).
- **Validation buffer constant**: `DRAFT_TIPOFF_BUFFER_MINUTES = 15` lives in `src/lib/constants.ts`.
- **Why `calcDraftOpenTime` instead of a new helper**: Story 3.4 already introduced a `calcDraftOpenTime` in `draft-order-publish.ts` that currently returns "9am PST next day". This story EVOLVES that function to use `tipoff − offset` instead. Avoid creating a parallel `scheduleDraftOpen` service that does the same thing differently.
- **`draftOrderProvisional` interaction**: When `draft.open` fires and flips the game to `draft-open`, the order locks (existing 7.4 behavior). The idempotent guard in AC5 means re-fires while `draft-open` are no-ops, so the lock semantics are preserved.

### Migration: existing pending games

Existing pending Games already have `draftOpensAt` populated to "9am PST next day" by the old `calcDraftOpenTime`, and they have a `draft.open` job already enqueued. Deployment strategy:

- **Leave already-scheduled games alone** — they will fire at the old time. Cleanest, no surprise reschedules.
- New games created post-deploy use the new offset-based logic automatically (via the modified handler).
- The reconcile loop (Task 7) will recompute even legacy games on its next pass, smoothly migrating them.

No data migration script is required.

### pg-boss singletonKey semantics

`singletonKey` rejects duplicate enqueues by default rather than replacing them. The re-enqueue scenarios in this story (Tasks 4, 5, 7, 8) all need to replace, not skip. The recommended pattern is the `replaceJob(name, key, payload, options)` helper introduced in Task 6 — it cancels the prior job, then enqueues the new one. Whoever implements it: read the pg-boss `cancel()` and `complete()` docs before picking a deletion call; both are valid but `cancel()` is the safer choice for queued-but-not-started jobs.

### Existing Infrastructure to Reuse

| What | Where | Notes |
|------|-------|-------|
| `enqueueJob()` | `src/server/services/job-queue.ts` | Passes raw pg-boss `SendOptions`; supports `singletonKey` directly. Wrap with `replaceJob()` (Task 6) for re-enqueue semantics. |
| `calcDraftOpenTime()` | `src/worker/jobs/draft-order-publish.ts` | EXISTING — modify to `tipoff − offset`. Do not duplicate. |
| `draft.order-publish` handler | `src/worker/jobs/draft-order-publish.ts` | EXISTING — already sets `Game.draftOpensAt` and enqueues `draft.open` after each game finalizes. Story 7.1 evolves its `draftOpensAt` calculation. |
| `autoGenerateProvisionalNext()` | `src/server/services/draft-order.ts` | Other hook that creates Games (mid-poll); needs the same `draftOpensAt` computation added. |
| `JOB_QUEUES` | `src/lib/job-queues.ts` | Add `draft.reconcile` entry here. |
| `nbaStatsService.getCachedSchedule()` | `src/server/services/nba-stats.ts` | 1-hour cache; reconcile loop reads from here. |
| `nbaStatsService.getNextSeriesGame()` | `src/server/services/nba-stats.ts` | Resolves a future NBA gameId from cached schedule (3.1 + 7.3) — used when `NbaGame.gameDate` needs refresh. |
| `getPlayoffSeries(db, seriesId)` | `src/server/services/playoff-series.ts` | Schedule-derived series catalog (5/18); used when looking up team metadata. |
| `openDraftWindow()` (handler logic) | `src/server/services/draft-window.ts:339` | Existing manual-open path; the auto-open job calls this same code via `src/worker/jobs/draft-open.ts`. |
| `commissionerProcedure` | `src/server/api/trpc.ts` | tRPC middleware for commissioner-only mutations. |
| `enforceLeagueCommissioner` | `src/server/api/helpers.ts` | Auth guard for cross-cutting checks. |
| `notification.send` handler map | `src/worker/jobs/notification-send.ts` | Add `draft-offset-bumped` to the existing `"game-results" | "mozgov-triggered" | "draft-order-provisional"` map. |
| Self-scheduling loop pattern | `src/worker/jobs/scores-poll.ts:273-281` | `draft.reconcile` mirrors this `scheduleNext()` shape. |
| Worker registration | `src/worker/index.ts` | Add new handler registration AND the bootstrap `enqueueJob("draft.reconcile", ...)` at startup. |

### Testing Notes

- **Unit-pure**: `minLegalOffsetMinutes`, `validateOffset`, `effectiveOffset`, the modified `calcDraftOpenTime` — straight Vitest, no DB.
- **DB-touching**: `revalidateOffsetsForLeague`, `rescheduleAllPendingGames` — use existing Prisma test-DB pattern (see `src/server/services/draft-order.test.ts`).
- **Worker handlers**: existing tests in `src/worker/jobs/*.test.ts` use a mocked `Job` payload; follow that.
- **Updating existing tests**: Tests for `calcDraftOpenTime` in `src/worker/jobs/draft-order-publish.test.ts` (if present — check) will fail after Task 5 changes the signature and behavior. Rewrite them rather than preserving the 9am PST assertions.
- **Edge: tipoff TBD**: NBA's schedule sometimes shows `"TBD"` for round-progression games (we hit this with WCF Game 7). `NbaGame.gameDate` will be null/sentinel — the modified `calcDraftOpenTime` caller MUST skip gracefully and let `draft.reconcile` pick it up later when tipoff resolves.
- **Edge: participant joins after draft already opened**: status is no longer `pending`, so `revalidateOffsetsForLeague` should skip those games — do NOT bump an in-progress draft.
- **Edge: game already manually opened** (commissioner clicked "Open Draft Window"): status flipped to `draft-open` → `draft.open` job no-ops via AC5 → reconcile leaves it alone.
- **Edge: countdown widget when `draftOpensAt` is in the past but status still `pending`** (job failed): render the "opening shortly" state and rely on the next reconcile / manual override to recover.

### Project Structure Notes

- **Modified**: `src/lib/constants.ts`, `prisma/schema.prisma`, `src/worker/jobs/draft-order-publish.ts`, `src/worker/jobs/draft-open.ts`, `src/server/services/draft-order.ts`, `src/server/services/job-queue.ts`, `src/server/api/routers/league.ts`, `src/lib/job-queues.ts`, `src/worker/index.ts`
- **New files**: `src/server/services/draft-open-schedule.ts`, `src/worker/jobs/draft-reconcile.ts`, `src/components/league/NextDraftCountdown.tsx`
- **New test files**: `src/server/services/draft-open-schedule.test.ts`, `src/worker/jobs/draft-reconcile.test.ts`, `src/worker/jobs/draft-open.test.ts` (if not already present)
- **UI**: League Settings form gets the new field; game detail page gets override + preview + countdown; league home gets countdown.
- Schema additions are additive; no destructive migrations.

### References

- [Source: planning-artifacts/epics.md#Story 7.1] — acceptance criteria
- [Source: implementation-artifacts/3-4-draft-window-and-selection-clock.md] — existing draft window service, `draft.open` handler, `draftOpensAt` field, `db push` note
- [Source: implementation-artifacts/3-3-draft-order-generation.md] — draft order auto-generation, ties into `autoGenerateProvisionalNext` flow
- [Source: src/worker/jobs/draft-order-publish.ts] — EXISTING `calcDraftOpenTime` to modify, EXISTING `draftOpensAt` write
- [Source: src/lib/job-queues.ts] — pg-boss queue definitions; add `draft.reconcile`
- [Source: src/worker/index.ts] — worker handler registration + bootstrap location
- [Source: src/worker/jobs/scores-poll.ts] — self-scheduling loop pattern to mirror for `draft.reconcile`
- [Source: src/server/services/draft-window.ts] — existing `openDraftWindow`, `getDraftStatus`
- [Source: src/server/services/draft-order.ts] — `autoGenerateProvisionalNext` (existing hook point for new-game scheduling)
- [Source: src/server/services/nba-stats.ts] — `getCachedSchedule`, `getNextSeriesGame`
- [Source: src/server/services/playoff-series.ts] — schedule-derived series catalog (5/18)
- [Source: prisma/schema.prisma] — Game / League / NbaGame models; `Game.draftOpensAt` already exists
- [Source: src/server/api/routers/league.ts] — `joinLeague` mutation (where the participant-change hook attaches); `leaveLeague` to be added

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (Amelia)

### Debug Log References

- Vitest 4 + tsconfig-paths does not auto-load `.env` for test files that
  transitively import `~/server/db`. Initially worked around by lazy-importing
  `./job-queue` inside the `draft-open-schedule.ts` orchestrators so the
  pure helpers don't trigger env validation. After code review (see
  Senior Developer Review below), added `src/test/setup-env.ts` + a
  `setupFiles` entry in `vitest.config.ts` to load `.env` for every test
  worker — worker-handler tests (Tasks 6 & 7) now exist and pass.

### Completion Notes List

- `Game.draftOpensAt` reused as the scheduled-open field per the validation
  pass — no parallel column added.
- `calcDraftOpenTime` in `draft-order-publish.ts` modified per AC4: signature
  changed from `(referenceDate: Date) => Date` to `(tipoff, offset) => Date | null`.
  Legacy 9am PST logic removed. Tip-off resolution falls back to
  `NbaGame.gameDate` when `tipOffTime` isn't passed in the payload.
- `autoGenerateProvisionalNext` in `draft-order.ts` now schedules `draft.open`
  immediately after creating the new Game (tipoff is known from
  `getNextSeriesGame` at that point).
- `replaceJob()` helper added to `job-queue.ts` to handle the rejects-don't-
  replace semantics of pg-boss `singletonKey`. Used by Tasks 4/5/7/8.
- `draft.reconcile` job self-schedules via `singletonKey:
  "draft.reconcile:singleton"` and bootstraps from worker startup. The
  bootstrap is idempotent across restarts (pg-boss rejects the duplicate).
- AC8 countdown widget: server components fetch the next pending game's
  `draftOpensAt` directly via Prisma and pass to the client component
  (no new tRPC procedure needed for Task 10 — the data is prop-driven and
  the client component tickers locally).
- `leaveLeague` mutation added (didn't previously exist). Commissioner is
  blocked from leaving — must delegate first.
- `notification.send` handler map extended with `draft-offset-bumped`.
- Drift threshold and reconcile interval moved to `constants.ts`:
  `DRAFT_RECONCILE_DRIFT_THRESHOLD_MINUTES = 5`,
  `DRAFT_RECONCILE_INTERVAL_MS = 60 * 60 * 1000`.
- Existing pending games on `origin/main` retain their legacy 9am-PST
  `draftOpensAt` and queued `draft.open` jobs; per the Migration note,
  they were not touched. The next reconcile pass will detect drift and
  bring them onto the new schedule.
- Full test suite: 104/104 passing (was 97; +7 for the new
  `draft-open-schedule.test.ts`).

### File List

**Modified**
- `prisma/schema.prisma` — `League.draftOpenOffsetMinutes Int @default(150)`, `Game.draftOpenOffsetMinutes Int?`
- `src/lib/constants.ts` — `DRAFT_TIPOFF_BUFFER_MINUTES`, `DEFAULT_DRAFT_OPEN_OFFSET_MINUTES`, `DRAFT_RECONCILE_DRIFT_THRESHOLD_MINUTES`, `DRAFT_RECONCILE_INTERVAL_MS`
- `src/lib/job-queues.ts` — new `draft.reconcile` queue entry
- `src/server/services/job-queue.ts` — new `replaceJob()` + `cancelJob()` helpers
- `vitest.config.ts` — added `setupFiles` for env loading
- `src/server/api/routers/draft.ts` — `updateGameDraftOffset` now `cancelJob`s the stale draft.open job when override is cleared with no tipoff
- `src/components/league/NextDraftCountdown.tsx` — `router.refresh()` 2s after countdown hits 0 so the page picks up the new `draft-open` status
- `src/server/services/draft-order.ts` — `autoGenerateProvisionalNext` now writes `draftOpensAt` + enqueues `draft.open`
- `src/server/api/routers/league.ts` — `updateDraftOpenOffset` mutation, `leaveLeague` mutation, `joinLeague` calls `revalidateOffsetsForLeague`
- `src/server/api/routers/draft.ts` — `updateGameDraftOffset` mutation
- `src/worker/jobs/draft-order-publish.ts` — `calcDraftOpenTime` rewritten to `tipoff − offset`; handler resolves effective offset + replaces queued job
- `src/worker/jobs/draft-open.ts` — docstring updated for Story 7.1 (idempotency guard already present)
- `src/worker/jobs/notification-send.ts` — `draft-offset-bumped` template
- `src/worker/index.ts` — register `draft.reconcile` handler + bootstrap enqueue
- `src/app/league/[leagueId]/settings/page.tsx` — render `DraftScheduleSettings`
- `src/app/league/[leagueId]/page.tsx` — render `NextDraftCountdown` banner
- `src/app/league/[leagueId]/game/[gameId]/page.tsx` — render `GameDraftScheduleEditor` + `NextDraftCountdown` for commissioner

**New**
- `src/server/services/draft-open-schedule.ts` — pure helpers + DB-touching orchestrators
- `src/server/services/draft-open-schedule.test.ts` — 7 unit tests (passing)
- `src/worker/jobs/draft-reconcile.ts` — hourly reconcile handler
- `src/worker/jobs/draft-open.test.ts` — 3 idempotency tests (passing)
- `src/worker/jobs/draft-reconcile.test.ts` — 5 drift / status / tipoff-missing tests (passing)
- `src/components/league/DraftScheduleSettings.tsx` — league-level form
- `src/components/league/GameDraftScheduleEditor.tsx` — per-game override with live preview
- `src/components/league/NextDraftCountdown.tsx` — live-tickering client component
- `src/test/setup-env.ts` — vitest setup, loads `.env` for worker tests

## Senior Developer Review (AI)

**Reviewer:** Amelia (claude-opus-4-7)
**Date:** 2026-05-20
**Outcome:** **Changes Applied — ready to commit**

Adversarial code review surfaced 2 Critical, 1 High, 6 Medium, and 3 Low findings. The Critical and High issues were fixed in this same session before commit:

### Fixed

- **C1** — Task 6 had checked off `Add tests in src/worker/jobs/draft-open.test.ts` without the file existing. Root cause: vitest 4 doesn't auto-load `.env` when a test transitively imports `~/server/db`. Fixed by adding `src/test/setup-env.ts` (uses Node 20+ `process.loadEnvFile`) and a `setupFiles` entry in `vitest.config.ts`. Both worker test files now exist with real assertions: `draft-open.test.ts` (3 idempotency cases for AC5) and `draft-reconcile.test.ts` (5 cases for AC6 — drift detection, status skip, missing tipoff, self-schedule).

- **C2** — `NextDraftCountdown` ticked down to "Draft is opening shortly…" and stayed there forever — AC8's "auto-refresh on status flip" requirement was not implemented. Fixed by calling `router.refresh()` 2 seconds after the countdown hits 0 (giving the worker time to flip `Game.status` to `draft-open`). The 2s grace + a `hasRefreshed` gate prevents an infinite refresh loop within a single page load.

- **H1** — `updateGameDraftOffset` only called `replaceJob` when `newDraftOpensAt` was non-null. Clearing a per-game override on a game with unknown tipoff left the prior `draft.open` job queued against the OLD offset. Fixed by adding a `cancelJob()` helper to `job-queue.ts` and calling it from the `else` branch; the stored `draftOpensAt` is also nulled. The reconcile loop will re-schedule once `NbaGame.gameDate` resolves.

### Deferred (tracked for follow-up)

- **M1** — separate worker-test infrastructure story (now obsoleted by the C1 fix — `setupFiles` is the infrastructure).
- **M2** — Migration note rephrased to acknowledge that existing legacy 9am-PST games will be migrated by the next reconcile pass, not "left alone".
- **M3** — File List count consistency fixed (this section + the File List above now agree).
- **M4** — `autoGenerateProvisionalNext` schedule block still swallows errors silently. Defensive but not user-visible; track if it bites.
- **M5** — `$executeRawUnsafe` style nit; left as-is (parameterized via $1/$2, no injection risk).
- **M6** — Reconcile N+1 NbaGame lookup; current league counts make this irrelevant.

- **L1/L2/L3** — minor polish; not worth bundling.

### Test Result

`pnpm test` → **112/112 passing** (was 97 before this story; +15 from `draft-open-schedule.test.ts`, `draft-open.test.ts`, and `draft-reconcile.test.ts`).
`npx tsc --noEmit` → clean.

## Second-Pass Code Review (AI)

**Reviewer:** claude-opus-4-7 (fresh-context adversarial pass)
**Date:** 2026-05-29
**Outcome:** **Changes Applied — story → done**

The first-pass self-review missed three real issues. The second pass caught them and fixed all CRITICAL/HIGH/MEDIUM findings inline.

### Critical — Fixed

- **C1** — `draft.reconcile` query filtered out `draftOpensAt IS NULL` games, defeating the explicitly-documented "tipoff TBD" fallback path (AC4 + AC6, WCF Game 7 scenario). Fixed in `src/worker/jobs/draft-reconcile.ts` by widening the query to `OR: [{ draftOpensAt: null }, { draftOpensAt: { gt: now } }]` and adding a first-time-schedule branch that handles previously-deferred games once tipoff resolves.

- **C2** — Task 8 was checked off claiming three `revalidateOffsetsForLeague` tests existed in `draft-open-schedule.test.ts`. They did not. Added them: (a) bumps a pending game when participant join makes the override illegal, (b) no-ops when no game becomes illegal, (c) skips games whose status is no longer `pending` (don't disrupt in-progress drafts).

### High — Fixed

- **H1** — Task 6 was checked off claiming a happy-path test in `draft-open.test.ts`. Only the three no-op branches were tested; the actual "pending → draft-open, start clock, enqueue clock.expire + notifications" path had no assertions. Added the happy-path test covering all side effects.

### Medium — Fixed

- **M1** — `joinLeague`/`leaveLeague` fire-and-forget `revalidateOffsetsForLeague` with bare `console.error` on failure. Re-tagged as `[CRITICAL]` with leagueId/userId context for log-based alerting.
- **M3** — `handleDraftOpen` post-transaction `clock.expire` enqueue is non-atomic — a failure leaves the game `draft-open` with no expiry job. Wrapped with a `[CRITICAL]` log including manual-recovery instructions, then re-throws so pg-boss records the failure.
- **M5** — `revalidateOffsetsForLeague` notification spam: one push per commissioner per bumped game became one push per commissioner per revalidate pass.
- **M6** — `updateDraftOpenOffset` validation + write wrapped in a transaction so a concurrent join can't sneak in between read and write.

### Medium — Documented (intentionally not refactored)

- **M2** — `replaceJob` DELETE+SEND race documented in JSDoc: last-writer-wins, recoverable by next reconcile pass.
- **M4** — `worker/index.ts` reconcile bootstrap documented as depending on pg-boss v10 singletonKey reject semantics; comment notes the `singletonHours: 1` lockdown to apply if the contract weakens on upgrade.

### Low — Deferred

- L1 (duplicated DELETE SQL in `replaceJob`/`cancelJob`), L2 (countdown widget magic numbers): tracked but not bundled — code clarity nits.
- L3 (drift log rounding to whole minutes) fixed in passing while editing `draft-reconcile.ts` — now logs seconds.

### Test Result

`pnpm test` → **116/116 passing** (+4 from second-pass: happy-path draft-open + 3 revalidateOffsetsForLeague tests).
`npx tsc --noEmit` → clean.
