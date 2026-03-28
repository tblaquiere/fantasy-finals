# Story 5.2: Mozgov Replacement Window & Sequential Clock

Status: done

## Story

As a participant whose drafted player triggered the Mozgov Rule,
I want to be notified and given a 3-minute clock to select a replacement,
so that I can act quickly.

## Acceptance Criteria

### AC1: Sequential Clock in Inverse Draft Order
**Given** multiple participants trigger Mozgov
**When** the replacement window opens
**Then** the last draft pick selects first, with 3-min clocks in sequence

### AC2: Auto-Assign on Expiry
**Given** my 3-minute clock expires
**When** no replacement was selected
**Then** the system auto-assigns using preference list or random fallback

### AC3: Mozgov Status UI
**Given** I navigate to the Mozgov page
**When** a window is active
**Then** I see all windows with countdown timers, status badges, and my replacement picker

## Tasks / Subtasks

- [x] Task 1: Add game.getMozgovStatus tRPC query
- [x] Task 2: Add draft.submitMozgovReplacement mutation
- [x] Task 3: Build MozgovWindow client component with countdown timer
- [x] Task 4: Build /league/[leagueId]/game/[gameId]/mozgov page
- [x] Task 5: Handle auto-assign via clock.expire with mozgov flag
