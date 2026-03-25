# Story 3.8: Preference List Management

Status: in-progress

## Story

As a participant,
I want to create and maintain a ranked preference list before my draft turn,
so that my picks are automatically submitted in my preferred order if I can't be there when my clock runs.

## Acceptance Criteria

### AC1: Create & Reorder Preference List
**Given** I am a league participant
**When** I open the preference list screen at any time
**Then** I can add eligible players to my ranked list and reorder them by dragging

### AC2: Drag-to-Reorder with dnd-kit
**Given** I reorder my preference list
**When** I drag a player row using the drag handle
**Then** the list reorders in real time (dnd-kit, touch-compatible)
**And** saving the list persists the order to the server

### AC3: Game-to-Game Cleanup
**Given** a prior game's preference list exists
**When** the draft.order-publish job fires
**Then** used players are silently removed, remaining players retain relative order

### AC4: Used Players Non-Selectable
**Given** I try to add a player I've already used in the series
**When** I tap to add them
**Then** they appear dimmed with "Already used" and cannot be added

### AC5: Privacy Enforcement
**Given** I am authenticated
**When** another participant or commissioner attempts to read my preference list
**Then** they receive a FORBIDDEN error

## Tasks / Subtasks

- [ ] Task 1: Add PreferenceListItem model to Prisma schema (AC: 1)
- [ ] Task 2: Build tRPC procedures with ownership enforcement (AC: 1, 2, 5)
- [ ] Task 3: Install dnd-kit and build preference list UI (AC: 1, 2, 4)
- [ ] Task 4: Add cleanup logic for game-to-game persistence (AC: 3)
