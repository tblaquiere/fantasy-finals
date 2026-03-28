# Story 5.4: Replacement Scoring — Void Original, Full Game Credit

Status: done

## Story

As a participant who selected a Mozgov replacement,
I want the original player's stats voided and my replacement credited with full-game fantasy points,
so that the replacement is meaningful and every stat counts.

## Acceptance Criteria

### AC1: Void Original
**Given** I confirm a Mozgov replacement
**When** the replacement is submitted
**Then** the original player's pick is marked voidedByMozgov and set to unconfirmed

### AC2: Full Game Credit
**Given** the game ends
**When** final scores are calculated
**Then** the replacement player's complete box score is used for scoring

### AC3: Mozgov Label
**Given** a Mozgov replacement appears in the draft feed and history
**When** any participant views it
**Then** it is labeled "Mozgov" to distinguish from a standard pick

## Tasks / Subtasks

- [x] Task 1: Add voidedByMozgov field to Pick model
- [x] Task 2: Voided picks excluded from live scores (confirmed: false filter)
- [x] Task 3: Replacement picks included in scoring (confirmed: true)
- [x] Task 4: Update LiveFeedItem method labels for mozgov-* methods
- [x] Task 5: Update history page method labels for mozgov-* methods
