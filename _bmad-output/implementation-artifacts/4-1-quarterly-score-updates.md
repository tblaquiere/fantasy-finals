# Story 4.1: Quarterly Score Updates

Status: done

## Story

As a participant,
I want to see live fantasy point updates during an active NBA game,
so that I can track how my pick is performing relative to others.

## Acceptance Criteria

### AC1: Box Score Polling
**Given** a game status is "active"
**When** the scores.poll worker runs
**Then** box scores are upserted for all players and fantasy points recalculated every 30s

### AC2: Live Scores Page
**Given** I navigate to the game scores page
**When** the game is active
**Then** I see each participant's pick with live fantasy points, stat line, and a LIVE badge with quarter indicator

### AC3: Final State
**Given** the NBA game ends (gameStatus === 3)
**When** the worker detects it
**Then** game status transitions to "final", polling stops, and badge shows FINAL

### AC4: Auto-Refresh
**Given** I am viewing the live scores page
**When** the game is still active
**Then** the page auto-refreshes every 30s; once final, polling stops

## Tasks / Subtasks

- [x] Task 1: Add scores.poll queue definition to job-queues.ts
- [x] Task 2: Implement handleScoresPoll worker handler (box score upsert, fantasy point calc, game final transition, notification on final)
- [x] Task 3: Register handleScoresPoll in worker/index.ts
- [x] Task 4: Add game.getLiveScores tRPC query (picks with box score data, period/isFinal indicator)
- [x] Task 5: Build ScoreBadge component (LIVE·Q[n] pulse, FINAL, PENDING/DRAFTING states)
- [x] Task 6: Build LiveScoreBoard client component with 30s auto-refresh
- [x] Task 7: Build /league/[leagueId]/game/[gameId] page with loading skeleton
