# Story 3.10: Commissioner Pick Override

Status: in-progress

## Story

As a commissioner,
I want to override any participant's submitted pick,
so that I can correct mistakes or handle edge cases during a live draft.

## Acceptance Criteria

### AC1: Override Option
**Given** I am the commissioner viewing a game's picks
**When** I tap the menu on any submitted pick
**Then** an "Override Pick" option appears

### AC2: Override Submission
**Given** I confirm an override
**When** the override is submitted
**Then** the original pick is replaced immediately
**And** the draft feed updates to show the corrected pick

### AC3: Override Label
**Given** the overridden pick appears in the feed
**When** any participant views it
**Then** it is labeled with an indicator that it was commissioner-overridden

## Tasks / Subtasks

- [x] Task 1: Add overridden field to Pick model
- [x] Task 2: Build draft.overridePick commissionerProcedure
- [x] Task 3: Update getFeed to include overridden flag
- [x] Task 4: Update LiveFeedItem with override indicator
