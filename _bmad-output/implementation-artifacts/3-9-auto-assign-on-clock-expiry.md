# Story 3.9: Auto-Assign on Clock Expiry

Status: in-progress

## Story

As a participant who can't pick in time,
I want the system to automatically select my top eligible preference list player when my clock expires,
so that I never forfeit my pick even when I'm unavailable.

## Acceptance Criteria

### AC1: Auto-Assign from Preference List
**Given** my selection clock expires
**When** the clock.expire pg-boss job fires
**Then** the system reads my preference list and selects the first eligible player
**And** the pick is labeled "auto - preference list"

### AC2: Auto-Assign Random
**Given** my clock expires and I have no preference list
**When** the clock.expire job fires
**Then** the system selects a random eligible player
**And** the pick is labeled "auto - system"

### AC3: No Eligible Players
**Given** all eligible players are exhausted
**When** the clock.expire job fires
**Then** no pick is submitted
**And** the commissioner is notified

## Tasks / Subtasks

- [x] Task 1: Implement clock.expire handler with preference list lookup
- [x] Task 2: Random fallback when no preference list
- [x] Task 3: Commissioner notification on no-eligible-player
