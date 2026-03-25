# Story 3.5: Eligible Player List

Status: in-progress

## Story

As a participant,
I want to browse a personalized, sorted list of eligible players during my draft turn,
so that I can quickly find and evaluate my options before the clock runs out.

## Acceptance Criteria

### AC1: Sorted Player List
**Given** it is my draft turn
**When** I open the pick screen
**Then** I see a list of eligible players sorted by series fantasy average descending
**And** each player row (~72px) shows: name, team, home/away indicator, series avg, last game total
**And** the screen loads within 3s on 4G

### AC2: Used Players Dimmed
**Given** I have already used a player earlier in this series
**When** I view the eligible player list
**Then** that player appears dimmed and non-selectable with a "used" indicator
**And** the player is not hidden — I can still see them in the list

### AC3: Expandable Stat Breakdown
**Given** I tap a player row
**When** it expands
**Then** I see the full scoring breakdown: Pts (x1), Reb (x2), Ast (x2), Stl (x3), Blk (x3) with last game values and fantasy subtotals

### AC4: Eligibility Rules
**Given** the system checks eligibility
**When** determining who is eligible
**Then** a player is only shown as selectable if: (a) active for tonight's game, (b) not previously used by me in this series, and (c) not already picked by anyone in this game

## Tasks / Subtasks

- [ ] Task 1: Add Pick model to Prisma schema (AC: 4)
  - [ ] Pick model: id, draftSlotId, nbaPlayerId, participantId, gameId, leagueId, method, confirmed, timestamps
  - [ ] `@@unique([leagueId, gameId, nbaPlayerId])` for double-draft prevention
  - [ ] Run `prisma db push` + `prisma generate`

- [ ] Task 2: Build `draft.getEligiblePlayers` tRPC endpoint (AC: 1, 2, 4)
  - [ ] Fetch live box score via nbaStatsService
  - [ ] Load participant's used players in series from Pick table
  - [ ] Load picks already made in this game from Pick table
  - [ ] Run eligibility checks via existing eligibility service
  - [ ] Compute series fantasy avg from BoxScore data
  - [ ] Return sorted list with eligibility status and stat breakdowns

- [ ] Task 3: Build pick screen UI (AC: 1, 2, 3)
  - [ ] Create `/draft/[gameId]/pick` page
  - [ ] Player rows: ~72px, name, team, home/away, series avg, last game total
  - [ ] Used players dimmed with "used" badge
  - [ ] Tap-to-expand stat breakdown with scoring multipliers
  - [ ] Skeleton loading states
  - [ ] Orange left border on selected player

- [ ] Task 4: Tests (AC: 1, 2, 4)
  - [ ] Eligibility filtering correctness
  - [ ] Sorting by series avg
  - [ ] Used player marking
  - [ ] Double-draft prevention
