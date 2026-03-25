# Story 4.2: Results Push Notification

Status: done

## Story

As a participant,
I want to receive a push notification when a game I'm in reaches final,
so that I can check the results without keeping the app open.

## Acceptance Criteria

### AC1: Notification on Game Final
**Given** a game I have a confirmed pick in reaches final
**When** the scores.poll worker detects gameStatus === 3
**Then** I receive a push notification with title "Game Final!" and a link to the scores page

### AC2: FCM Dispatch
**Given** I have one or more registered push tokens
**When** a notification.send job fires for my userId
**Then** the notification is sent to all registered devices via FCM

### AC3: Stale Token Cleanup
**Given** a push token is no longer valid
**When** FCM returns an invalid-registration-token error
**Then** the stale token is automatically deleted from the database

### AC4: Notification Templates
**Given** the system sends various notification types (game-results, draft-open, your-turn, pick-reminder, etc.)
**When** a notification.send job runs
**Then** the correct title and body are resolved from the type-to-template map

## Tasks / Subtasks

- [x] Task 1: Game final detection and notification enqueue (already in scores-poll.ts)
- [x] Task 2: Implement handleNotificationSend worker handler with FCM dispatch
- [x] Task 3: Add notification template map for all notification types
- [x] Task 4: Stale token cleanup on FCM error
- [x] Task 5: Register handleNotificationSend in worker/index.ts (replace stub)
