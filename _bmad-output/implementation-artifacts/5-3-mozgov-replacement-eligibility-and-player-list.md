# Story 5.3: Mozgov Replacement Eligibility & Player List

Status: done

## Story

As a participant in a Mozgov replacement window,
I want to see a pre-filtered list of eligible replacement players,
so that I can make a valid selection quickly.

## Acceptance Criteria

### AC1: Eligibility Rules
**Given** I am in the Mozgov replacement window
**When** the eligible player list loads
**Then** it shows only players who are active, played 5+ min in most recent active game, and not already used by me

### AC2: Most Recent Active Game Logic
**Given** a player missed games due to injury
**When** eligibility is evaluated
**Then** the system uses the most recent game where they have a box score with minutes > 0

### AC3: First Half Stats
**Given** I view the replacement list
**When** I see a player
**Then** their current half stats (min, pts, reb, ast, stl, blk) are shown

## Tasks / Subtasks

- [x] Task 1: Add game.getMozgovEligiblePlayers tRPC query with most-recent-active-game logic
- [x] Task 2: Integrate player list into MozgovReplacementPicker component
- [x] Task 3: Show first-half stats and fantasy points for each eligible player
