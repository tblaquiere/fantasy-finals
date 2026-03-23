# Story 3.2: Fantasy Scoring Engine

Status: done

## Story

As a participant,
I want my player's fantasy points calculated correctly and consistently,
so that I can trust the standings and know exactly how points are earned.

## Acceptance Criteria

### AC1: Pure Scoring Function
**Given** a player's raw box score stats (PTS, REB, AST, STL, BLK)
**When** `scoring.ts` calculates fantasy points
**Then** it returns: `(1 × PTS) + (2 × REB) + (2 × AST) + (3 × STL) + (3 × BLK)` as an integer
**And** the function has no database calls, no external calls — pure input/output

### AC2: Known Stat Line Verification
**Given** the scoring function is tested
**When** the test suite runs
**Then** known stat lines produce exact expected fantasy totals (e.g., 17 PTS, 4 REB, 6 AST, 1 STL, 0 BLK → 17 + 8 + 12 + 3 + 0 = 40)

## Tasks / Subtasks

- [x] Implement `calculateFantasyPoints` in `src/server/services/scoring.ts` (AC: 1)
  - [x] Export `PlayerStatLine` interface (pts, reb, ast, stl, blk)
  - [x] Pure function — no DB or external calls
  - [x] Formula: `1*pts + 2*reb + 2*ast + 3*stl + 3*blk`
- [x] Write tests in `src/server/services/scoring.test.ts` (AC: 2)
  - [x] Standard stat line: 17/4/6/1/0 → 40
  - [x] Big stat line: 30/10/5/2/1 → 69
  - [x] All-zero → 0
  - [x] Steals+blocks only: 0/0/0/3/4 → 21
  - [x] Points only: 50/0/0/0/0 → 50
  - [x] Integer assertion: 25/7/3/1/2 → 54

## Dev Notes

### Pre-Implementation Status

**This story was implemented ahead of schedule during Story 3.1.** The `game.ts` router required fantasy point enrichment in `getLiveBoxScore`, which necessitated `calculateFantasyPoints` before the router could be built. Rather than stub it, the full implementation was written and tested at that time.

Both ACs are fully satisfied as of Story 3.1 completion.

### Implementation Details

**Formula (FR27):** `1×PTS + 2×REB + 2×AST + 3×STL + 3×BLK`

The formula always produces integer output when given integer inputs (all multipliers are whole numbers), so no rounding is needed.

**Usage in `game.ts` router:**
```typescript
fantasyPoints: calculateFantasyPoints({
  pts: p.points,
  reb: p.reboundsTotal,
  ast: p.assists,
  stl: p.steals,
  blk: p.blocks,
}),
```

**Usage in `BoxScore` schema:** The `fantasy_points` column on the `box_scores` table stores the calculated value. The `corrected_fantasy_points` column stores overrides when post-game stat corrections change the final total (Epic 6).

### Architecture Compliance

- `scoring.ts` lives at `src/server/services/scoring.ts` per architecture directory layout [Source: architecture.md#Project Structure]
- Test co-located at `src/server/services/scoring.test.ts` [Source: architecture.md#Test File Location]
- Pure function with no side effects — safe to call from any context (worker, router, tests) [Source: epics.md#Story 3.2 AC1]
- `PlayerStatLine` interface uses abbreviated field names (`pts`, `reb`, `ast`, `stl`, `blk`) to decouple from the NBA API's verbose field naming (`points`, `reboundsTotal`, etc.)

### References

- [Source: planning-artifacts/epics.md#Story 3.2]
- [Source: planning-artifacts/architecture.md#Project Structure]
- [Source: planning-artifacts/epics.md#FR27]
- Implementation: `src/server/services/scoring.ts`
- Tests: `src/server/services/scoring.test.ts`
- Consumer: `src/server/api/routers/game.ts` (`getLiveBoxScore`)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6 (create-story; implementation pre-completed in Story 3.1 by claude-opus-4-6)

### Debug Log References

N/A — no implementation work required; Story 3.1 delivered this story's scope.

### Completion Notes List

- `calculateFantasyPoints` implemented and tested as part of Story 3.1 scope bleed
- All 6 tests pass including the exact example from the AC (17/4/6/1/0 → 40)
- `PlayerStatLine` interface exported for use by future stories (BoxScore writer, correction engine)
- `fantasyPoints` field on `BoxScore` schema persists calculated values for standings queries

### File List

- `src/server/services/scoring.ts` — created (Story 3.1)
- `src/server/services/scoring.test.ts` — created (Story 3.1)

### Change Log

| Date | Change | Reason |
|------|--------|--------|
| 2026-03-22 | Story file created | Story was pre-implemented in 3.1 |
