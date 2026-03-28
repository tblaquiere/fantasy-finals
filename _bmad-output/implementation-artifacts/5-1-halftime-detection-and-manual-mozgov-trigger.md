# Story 5.1: Halftime Detection & Manual Mozgov Trigger

Status: done

## Story

As a commissioner,
I want to be able to open the Mozgov replacement window -- either automatically when the system detects a qualifying player, or manually via a trigger button -- so that the Mozgov Rule can always be applied.

## Acceptance Criteria

### AC1: Automatic Detection
**Given** a game reaches halftime
**When** the halftime.check worker polls every 30s
**Then** it checks each confirmed pick against the 5-minute threshold and creates MozgovWindow records for triggered participants

### AC2: Notification
**Given** a player triggers the Mozgov Rule
**When** the window is created
**Then** the affected participant receives a push notification within 30s

### AC3: DNP Exclusion
**Given** a player has a DNP designation
**When** the halftime check runs
**Then** that player does NOT trigger the Mozgov Rule

### AC4: Commissioner Manual Trigger
**Given** a commissioner viewing league settings
**When** they tap "Trigger Mozgov" for a participant
**Then** a MozgovWindow is created and the window behaves identically to auto-triggered

## Tasks / Subtasks

- [x] Task 1: Create MozgovWindow Prisma model with status, order, clock fields
- [x] Task 2: Add voidedByMozgov field to Pick model, make draftSlotId optional
- [x] Task 3: Implement halftime-check worker handler with auto-detection
- [x] Task 4: Create shared mozgov-window service (startNextMozgovClock)
- [x] Task 5: Update clock-expire handler to support mozgov window expiry with auto-assign
- [x] Task 6: Add draft.triggerMozgov commissioner mutation
- [x] Task 7: Trigger halftime.check from scores-poll when period >= 2
- [x] Task 8: Add mozgov notification templates
