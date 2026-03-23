# Story 3.3: Draft Order Generation

Status: done

## Story

As a participant,
I want the draft order generated automatically — random for Game 1 and inverse standings for subsequent games,
so that every game starts fairly without anyone doing manual math.

## Acceptance Criteria

### AC1: Game 1 — Random Order
**Given** Game 1 of a series is starting for a league
**When** the commissioner triggers draft order generation
**Then** participant pick positions (1 through N) are assigned randomly
**And** the draft slots are persisted to the database and visible to all participants

### AC2: Game 2+ — Inverse Standings with Tie-Break
**Given** Game 2 or later is starting for a league
**When** draft order is generated
**Then** participants are ordered by inverse cumulative fantasy series score (lowest total picks first)
**And** if two participants have equal cumulative scores, the one with the higher draft pick number from the prior game gets the earlier pick in the next game

### AC3: Draft Order Visible to Participants
**Given** the draft order has been generated
**When** a participant views the league draft page
**Then** they can see the full draft order (position + participant name) for the upcoming game

## Tasks / Subtasks

- [x] Add `Game` and `DraftSlot` models to `prisma/schema.prisma` (AC: 1, 2, 3)
  - [x] `Game`: leagueId, nbaGameId, gameNumber, status; `@@unique([leagueId, nbaGameId])`
  - [x] `DraftSlot`: gameId, participantId, pickPosition; `@@unique([gameId, participantId])`, `@@unique([gameId, pickPosition])`
  - [x] Add relations on `League` (games), `Participant` (draftSlots), `Game` (draftSlots)
  - [x] Run `pnpm prisma db push` to sync schema
- [x] Implement `calcDraftOrder` in `src/server/services/draft-order.ts` (AC: 1, 2)
  - [x] Export `ParticipantStanding` interface
  - [x] Game 1: Fisher-Yates shuffle of participantIds — use `Math.random()` (no crypto needed for MVP)
  - [x] Game 2+: sort by `cumulativeFantasyPoints` ascending; tie-break by `priorGamePickPosition` descending (higher prior pick → earlier next pick)
  - [x] Pure function — no DB calls, fully testable
- [x] Write tests in `src/server/services/draft-order.test.ts` (AC: 1, 2)
  - [x] Game 1: output is a permutation of input (all participants present, no duplicates)
  - [x] Game 2 inverse order: participant with lower score picks first
  - [x] Game 2 tie-break: equal scores, higher prior pick position picks first
  - [x] Game 2 three-way tie: all three at equal score, correct secondary ordering
  - [x] Single participant: order is trivially [participant]
- [x] Create `src/server/api/routers/draft.ts` with initial procedures (AC: 1, 2, 3)
  - [x] `generateDraftOrder`: `commissionerProcedure`, input `{ leagueId, nbaGameId }`, creates `Game` + `DraftSlot` records in a Prisma `$transaction`; validates league membership and commissioner role; errors if order already generated
  - [x] `getDraftOrder`: `protectedProcedure`, input `{ leagueId, gameId }`, returns slots with participant name, pick position; validates caller is a league participant
- [x] Register `draftRouter` in `src/server/api/root.ts` (AC: 3)

## Dev Notes

### Schema Design

Two new models gate on this story. They are prerequisites for every subsequent draft story (3.4 through 3.12).

**`Game`** — a league-scoped game instance. Distinct from `NbaGame` (which is raw NBA data). One `NbaGame` can appear in many leagues; one `Game` record ties a specific league to that NBA game.

```prisma
// Story 3.3: Draft Order Generation

model Game {
  id           String   @id @default(cuid())
  leagueId     String   @map("league_id")
  nbaGameId    String   @map("nba_game_id")
  gameNumber   Int      @map("game_number")  // 1-based within series for this league
  status       String   @default("pending")  // pending | draft-open | active | final
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  league     League      @relation(fields: [leagueId], references: [id])
  draftSlots DraftSlot[]

  @@unique([leagueId, nbaGameId])
  @@map("games")
}

model DraftSlot {
  id            String   @id @default(cuid())
  gameId        String   @map("game_id")
  participantId String   @map("participant_id")
  pickPosition  Int      @map("pick_position")  // 1 = picks first
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")

  game        Game        @relation(fields: [gameId], references: [id])
  participant Participant @relation(fields: [participantId], references: [id])

  @@unique([gameId, participantId])
  @@unique([gameId, pickPosition])
  @@map("draft_slots")
}
```

Add `games League[]` relation to `League`, and `draftSlots DraftSlot[]` to `Participant`.

**`nbaGameId` on `Game`** is a plain `String` (not a foreign key to `NbaGame`) because leagues created during the playoffs may reference NbaGames that don't yet exist in our DB. The `NbaGame` record is created by the box-score polling job (Story 4.1). Keeping it a loose reference avoids a hard dependency.

### Draft Order Algorithm (FR9)

**Game 1 — Fisher-Yates shuffle:**
```typescript
function shuffleParticipants(participantIds: string[]): string[] {
  const arr = [...participantIds];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}
```

**Game 2+ — Inverse standings sort:**
```typescript
// Sort ascending by cumulative score; ties broken by descending prior pick position
// (participant who picked LAST in game N picks FIRST in game N+1)
standings.sort((a, b) => {
  if (a.cumulativeFantasyPoints !== b.cumulativeFantasyPoints) {
    return a.cumulativeFantasyPoints - b.cumulativeFantasyPoints; // lower score picks first
  }
  // Tie-break: higher prior pick position → earlier next pick (descending)
  const aPrior = a.priorGamePickPosition ?? 0;
  const bPrior = b.priorGamePickPosition ?? 0;
  return bPrior - aPrior;
});
```

### Service Interface

```typescript
// src/server/services/draft-order.ts

export interface ParticipantStanding {
  participantId: string;
  cumulativeFantasyPoints: number; // sum of fantasyPoints across all prior games in series
  priorGamePickPosition: number | null; // pickPosition from most recent game; null for Game 1
}

/**
 * Calculate draft pick order for a game.
 * Game 1 (no standings): random shuffle.
 * Game 2+ (standings provided): inverse cumulative score, tie-break by prior pick position.
 *
 * Returns participantIds in pick order (index 0 picks first, i.e., pick #1).
 * Pure function — no DB calls.
 */
export function calcDraftOrder(
  participantIds: string[],
  standings?: ParticipantStanding[],
): string[]
```

### tRPC Router Design

**File:** `src/server/api/routers/draft.ts`

```typescript
export const draftRouter = createTRPCRouter({
  // Commissioner triggers this once per game, after league is formed
  generateDraftOrder: commissionerProcedure
    .input(z.object({ leagueId: z.string(), nbaGameId: z.string() }))
    .mutation(async ({ ctx, input }) => { ... }),

  // Any participant can read the draft order
  getDraftOrder: protectedProcedure
    .input(z.object({ leagueId: z.string(), gameId: z.string() }))
    .query(async ({ ctx, input }) => { ... }),
});
```

`commissionerProcedure` was established in Epic 1 (Story 1.3 RBAC). It enforces `isCommissioner === true` for the league. Use it instead of `protectedProcedure` + manual check.

`generateDraftOrder` must:
1. Verify the game doesn't already have draft slots (idempotency guard)
2. Load all participants for the league
3. Load standings for prior games (for Game 2+) — query DraftSlot + BoxScore join if available
4. Call `calcDraftOrder`
5. Wrap `Game.create` + bulk `DraftSlot.createMany` in `ctx.db.$transaction`

### What This Story Does NOT Include

- Draft window auto-open at 9am PST (Story 3.4 — pg-boss job)
- Selection clocks (Story 3.4)
- Pick submission or confirmation (Story 3.6)
- Auto-assign on clock expiry (Story 3.9)
- Push notifications for draft order publication (Story 3.11)
- The `Pick` model (Story 3.6 adds this)
- The `Standing` model (Story 6.1 adds this — standings for draft order are computed inline from BoxScore/Pick joins in this story)
- The `PreferenceItem` model (Story 3.8)

### Architecture Compliance

- Service file: `src/server/services/draft-order.ts` [Source: architecture.md#Project Structure]
- Router file: `src/server/api/routers/draft.ts` [Source: architecture.md#Project Structure]
- Utility function name: `calcDraftOrder` (architecture explicitly names this) [Source: architecture.md#Code Naming Conventions]
- All models: cuid2 string IDs, camelCase field names, snake_case `@map`/`@@map` [Source: architecture.md#Database Naming Conventions]
- Commissioner-only generation protected via `commissionerProcedure` (RBAC at tRPC middleware, never checked in UI component) [Source: architecture.md#Additional Requirements]
- `$transaction` wrapping Game + DraftSlot creation prevents partial writes [Source: architecture.md#Requirements Coverage Validation]
- Tests co-located: `draft-order.test.ts` next to `draft-order.ts` [Source: architecture.md#Test File Location]

### Testing Notes

- `calcDraftOrder` is a pure function — no mocking needed
- For Game 1 randomness test: assert result is a valid permutation (same elements, length = N), not the exact order
- For Game 2 determinism tests: use fixed standing inputs and assert exact output order
- Tests live in `src/server/services/draft-order.test.ts`

### Previous Story Context (from 3.1)

- `Participant` model already exists in `prisma/schema.prisma` with `id`, `userId`, `leagueId`, `isCommissioner`
- `League` model already exists
- `NbaGame` model already exists (raw NBA game data — **different** from the `Game` model this story adds)
- `db push` is used (not `migrate dev`) due to Railway migration drift from prior stories [Source: Story 3.1 Dev Notes]
- Run `pnpm prisma db push` after schema changes, then `pnpm prisma generate`
- `commissionerProcedure` is exported from `~/server/api/trpc` (established in Story 1.3)

### References

- [Source: planning-artifacts/epics.md#Story 3.3]
- [Source: planning-artifacts/epics.md#FR9]
- [Source: planning-artifacts/architecture.md#Naming Patterns] — `DraftSlot`, `@@map("draft_slots")`, `calcDraftOrder`
- [Source: planning-artifacts/architecture.md#Project Structure] — `draft-order.ts`, `draft.ts` router
- [Source: planning-artifacts/architecture.md#Requirements Coverage Validation] — `$transaction` for atomic writes
- [Source: Story 3.1 completion notes] — `db push` instead of `migrate dev`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

N/A — clean implementation, no errors.

### Completion Notes List

- `Game` and `DraftSlot` schema models added; `pnpm prisma db push` synced to Railway DB
- `calcDraftOrder` pure function: Fisher-Yates for Game 1; inverse-score + tie-break sort for Game 2+
- 12 tests: permutation validation, score ordering, tie-break (2-way and 3-way), edge cases, non-mutation guarantees
- `generateDraftOrder` commissioner procedure uses `$transaction` for atomic Game + DraftSlot creation; idempotency guard via unique constraint conflict
- Fantasy points default to 0 for Game 2+ until Pick model exists (Story 3.6); tie-break by prior pick position still functions correctly
- `getDraftOrder` validates league membership before returning slots
- `draftRouter` registered in `root.ts`
- 47/47 tests pass across all services; TypeScript clean

### File List

- `prisma/schema.prisma` — modified (added Game, DraftSlot models; League.games, Participant.draftSlots relations)
- `src/server/services/draft-order.ts` — created
- `src/server/services/draft-order.test.ts` — created
- `src/server/api/routers/draft.ts` — created
- `src/server/api/root.ts` — modified (added draftRouter)
- `src/server/api/helpers.ts` — created (extracted enforceLeagueCommissioner, enforceLeagueMember)
- `src/server/api/routers/league.ts` — modified (imports enforceLeagueCommissioner from helpers)

### Change Log

| Date | Change | Reason |
|------|--------|--------|
| 2026-03-22 | Added Game + DraftSlot schema models | Story 3.3 AC1/2/3 |
| 2026-03-22 | Created draft-order.ts service + tests | Pure calcDraftOrder function (FR9) |
| 2026-03-22 | Created draft.ts router, registered in root.ts | generateDraftOrder + getDraftOrder tRPC procedures |
| 2026-03-22 | Code review fixes: scoped getDraftOrder by league, moved queries inside $transaction, extracted shared helpers, removed email leak | 4 issues fixed (1 HIGH, 3 MED) |
