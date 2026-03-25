# Story 3.6: Pick Submission & Confirmation

Status: in-progress

## Story

As a participant,
I want to tap a player, confirm my pick, and have a 5-second undo window,
so that I feel certain my selection is locked in correctly without fear of accidental taps.

## Acceptance Criteria

### AC1: Confirmation Dialog
**Given** I have selected a player on the pick screen
**When** I tap "Confirm Pick"
**Then** a confirmation dialog appears showing the player name and team
**And** tapping "Confirm" in the dialog finalizes the pick

### AC2: Success State with Undo
**Given** my pick is confirmed
**When** the success state appears
**Then** I see a green banner with the player name and "Your pick is in"
**And** a Sonner snackbar appears offering "Undo" for 5 seconds

### AC3: Undo Pick
**Given** the 5-second undo window is active
**When** I tap "Undo"
**Then** the pick is cancelled and I return to the player list to re-pick

### AC4: Lock After Undo Window
**Given** 5 seconds pass after confirmation
**When** the undo window expires
**Then** the pick is locked and cannot be changed (except by commissioner override)

### AC5: Concurrent Pick Rejection
**Given** I try to pick a player who was just taken by another participant
**When** my confirmation is submitted
**Then** the server rejects it with "Player already picked" and I see an error
**And** the pick is never finalized (Prisma transaction + unique constraint enforced)

## Tasks / Subtasks

- [ ] Task 1: Install Sonner, set up Toaster in layout (AC: 2)
- [ ] Task 2: Build `draft.submitPick` mutation (AC: 1, 5)
  - [ ] Validate it's the caller's draft turn (active slot)
  - [ ] Validate player eligibility via existing service
  - [ ] Create Pick record in Prisma transaction with unique constraint
  - [ ] Advance clock via advanceClock()
- [ ] Task 3: Build `draft.undoPick` mutation (AC: 3)
  - [ ] Delete the pick within 5-second window (check createdAt)
  - [ ] Do NOT revert clock advancement
- [ ] Task 4: Build `draft.confirmPick` mutation (AC: 4)
  - [ ] Set confirmed=true, locking the pick permanently
- [ ] Task 5: Build confirmation UI flow (AC: 1, 2, 3, 4, 5)
  - [ ] Confirmation dialog with player name/team
  - [ ] Green success banner
  - [ ] Sonner undo toast (5s)
  - [ ] Error handling for "Player already picked"
