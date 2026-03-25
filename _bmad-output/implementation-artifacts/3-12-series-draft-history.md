# Story 3.12: Series Draft History

Status: in-progress

## Story

As a participant,
I want to view the complete draft history for the current series,
so that I can track all picks from every prior game, see draft pick order numbers, and know each participant's burned player list.

## Acceptance Criteria

### AC1: Complete History View
**Given** I am viewing the history page
**When** it loads
**Then** I see each game with picks listed including participant name, player name, pick #, and labels

### AC2: Burned Players Visible
**Given** a participant has used players in prior games
**When** I view the history
**Then** their burned players are visible to all league participants

### AC3: My Used Players Highlighted
**Given** I am planning my next pick
**When** I view the history page
**Then** I can clearly see which players I have already used

## Tasks / Subtasks

- [x] Task 1: Build draft.getSeriesHistory tRPC query
- [x] Task 2: Build /league/[leagueId]/history page
- [x] Task 3: Show burned player list per participant
- [x] Task 4: Highlight current user's picks
