# Story 3.7: Real-Time Draft Feed

Status: in-progress

## Story

As a participant,
I want to see all picks appear in real time as they're submitted — with pick order numbers and auto-assign labels,
so that I know exactly what's happening in the draft as it unfolds.

## Acceptance Criteria

### AC1: Live Pick Updates
**Given** the draft window is open
**When** any participant submits a pick
**Then** it appears in the draft feed for all other participants within 3 seconds
**And** each feed entry shows: participant name, player picked, draft pick number (e.g., "pick #3"), and auto-assign label if applicable

### AC2: Draft Open Indicator
**Given** the draft feed is visible
**When** it is actively updating
**Then** a "DRAFT OPEN" indicator is shown at the top of the feed
**And** new picks appear with a subtle entrance animation (LiveFeedItem component)

### AC3: Static History When Closed
**Given** the draft has closed (tip-off reached or all picks submitted)
**When** I view the draft feed
**Then** the feed shows the complete static pick history with no live indicator

### AC4: Background Polling Paused
**Given** the tab is not focused
**When** the poll interval fires
**Then** polling is paused (refetchIntervalInBackground: false) to avoid unnecessary requests

## Tasks / Subtasks

- [ ] Task 1: Build `draft.getFeed` tRPC query (AC: 1, 3)
  - [ ] Return confirmed picks with participant name, player info, pick position, method
  - [ ] Include game draft status for live/closed indicator

- [ ] Task 2: Build DraftFeed page at `/draft/[gameId]` (AC: 1, 2, 3, 4)
  - [ ] Client component with `refetchInterval: 3000` when draft open
  - [ ] `refetchIntervalInBackground: false`
  - [ ] "DRAFT OPEN" indicator
  - [ ] Static mode when draft closed

- [ ] Task 3: Build LiveFeedItem component (AC: 1, 2)
  - [ ] Entrance animation for new picks
  - [ ] Pick number, participant name, player picked, auto-assign label
