# Story 3.11: Draft Notifications

Status: in-progress

## Story

As a participant,
I want push notifications when the draft order is published, when it's my turn, and when my clock is almost up,
so that I never miss my window to pick.

## Acceptance Criteria

### AC1: Draft Order Published Notification
**Given** the draft order is published
**When** the notification fires
**Then** I receive a push notification with a link to set/review my preference list

### AC2: Draft Open Notification
**Given** the draft window opens at 9am PST
**When** the draft.open job fires
**Then** all participants receive a "draft is open" notification

### AC3: Your Turn Notification
**Given** it is my turn to pick
**When** the previous participant submits
**Then** I receive a notification deep-linking to the pick screen

### AC4: Pick Reminder
**Given** fewer than 10 minutes remain on my clock
**When** the reminder fires
**Then** I receive a reminder notification deep-linking to the pick screen

## Tasks / Subtasks

- [x] Task 1: draft-order-publish already sends notifications (Story 3.4)
- [x] Task 2: draft-open handler sends "draft is open" to all participants
- [x] Task 3: advanceClock sends "your turn" notification to next participant
- [x] Task 4: Schedule pick-reminder 10 min before clock expiry
