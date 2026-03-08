---
stepsCompleted: [step-01-validate-prerequisites, step-02-design-epics, step-03-epic-1, step-03-epic-2, step-03-epic-3, step-03-epic-4, step-03-epic-5, step-03-epic-6, step-04-final-validation]
status: complete
inputDocuments:
  - '_bmad-output/planning-artifacts/prd.md'
  - '_bmad-output/planning-artifacts/architecture.md'
  - '_bmad-output/planning-artifacts/ux-design-specification.md'
project_name: 'fantasy-finals'
user_name: 'Todd'
date: '2026-03-07'
---

# fantasy-finals - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for fantasy-finals, decomposing the requirements from the PRD, UX Design, and Architecture into implementable stories.

## Requirements Inventory

### Functional Requirements

FR1: Commissioner can create a league scoped to a specific NBA playoff series
FR2: Commissioner can generate and share invite links for a league
FR3: Commissioner can delegate the commissioner role for a league to another participant
FR4: Commissioner can create and manage multiple independent leagues
FR5: Admin can view and take action on all leagues across the platform
FR6: Participant can join a league using an invite link
FR7: System restricts league access to invited participants only
FR8: System enforces player eligibility rules: (a) active for tonight's game (eligible to play — on game roster, not injured; DNP due to injury does not count as active), (b) not previously used by this participant in the current series (per-person exclusivity), (c) not double-drafted in the same game
FR9: System generates draft order randomly for Game 1 and by inverse cumulative series standings for subsequent games. Tie-breaking: participant with the higher draft pick number in that game earns the earlier pick in the next game's draft order
FR10: System publishes draft order ~30 minutes after final game scores are confirmed. Draft window opens automatically at 9am PST the morning following the previous game. Participants may set/update their preference list immediately after draft order publishes. Sequential selection clocks begin at draft window open. Draft closes at tip-off of the next game
FR11: Participant can browse a personalized list of eligible players during their draft turn. Players already used by this participant in the current series are shown as unavailable (dimmed, non-selectable) rather than hidden. Players used by other participants remain fully available to this participant
FR12: Participant can submit a pick during their draft turn
FR13: System enforces a per-pick selection clock of up to 1 hour
FR14: System auto-assigns a pick on clock expiry using the participant's preference list if available, or a random eligible player otherwise
FR15: System labels auto-assigned picks as `auto — preference list` or `auto — system`
FR16: Draft feed displays all picks in real time as they are submitted
FR17: Participant can create and maintain a ranked preference list before their draft turn
FR18: System persists the preference list game-to-game, removing ineligible players at execution time
FR19: Preference list is accessible only to the individual participant — commissioner and admin cannot view any participant's list
FR20: System requires explicit pick confirmation before finalizing any pick
FR21: Commissioner can override any participant's submitted pick
FR22: System detects when a drafted player is active for the game but has played fewer than 5 minutes at halftime. Inactive/injured players (DNP) do not trigger the Mozgov Rule
FR23: System notifies all affected participants simultaneously and opens a replacement window at halftime. Multiple triggers resolved in draft-order sequence (lowest draft pick number selects first). Each triggered participant has a sequential 3-minute selection clock. Hard deadline is second-half tip-off. Clock expiry triggers auto-assign via FR14 logic
FR24: Participant can select a replacement player from a filtered eligible list during the replacement window. Mozgov replacement eligibility: (a) active for tonight's game, (b) played 5+ minutes in most recent game in which they were active (accounts for injury absences), (c) not already used by this participant in the current series
FR25: System voids the original player's fantasy points entirely and credits the replacement player with full-game fantasy points — the replacement player's complete box score for the entire game (both halves) counts toward the participant's score
FR26: System retrieves box score data from a third-party NBA stats provider at the end of each quarter (Q1, Q2/halftime, Q3, and final buzzer). MVP update cadence is quarterly
FR27: System calculates fantasy points using: 1×PTS + 2×REB + 2×AST + 3×STL + 3×BLK
FR28: Participant can view their player's current fantasy point total, updated at the end of each quarter. Standings display a "LIVE · Q[n]" indicator during active games and "FINAL" after the final buzzer
FR29: System applies post-game official stat corrections automatically to fantasy point totals
FR30: System recalculates standings and draft order when stat corrections affect previously computed values
FR31: System ensures stat correction propagation completes before the next draft window opens
FR32: System maintains a series leaderboard showing cumulative fantasy points per participant
FR33: System displays the per-game winner and full stat breakdown after each game: Pts / Reb / Ast / Stl / Blk / Fantasy Total per participant's player
FR34: System highlights the per-game leader in each scoring category (Pts, Reb, Ast, Stl, Blk, Fantasy Total) within the game's stat breakdown. Each participant's burned player list is visible to all league participants
FR35: System sends a push notification when draft order is published (~30 min after final scores post) and a second notification when the draft window opens at 9am PST. Draft open notification includes a direct link to set or review preference list
FR36: System sends a push notification when it is a participant's turn to pick, deep-linking directly to the pick screen
FR37: System sends a pick reminder push notification when fewer than 10 minutes remain on a participant's selection clock
FR38: System sends a push notification to the affected participant when the Mozgov Rule is triggered
FR39: System sends a push notification when game results and updated standings are posted
FR40: System delivers all push notifications via FCM-backed web push without requiring a native app
FR41: Users can register and authenticate to access the platform (magic link / passwordless email primary; Google OAuth optional; email+password fallback — TBD in implementation)
FR42: System enforces role-based access control with distinct permissions for participant, commissioner, and admin roles
FR43: Preference list read access is restricted to the individual participant at the API layer, regardless of role
FR44: Participant can view the complete draft history for the current series, including all picks made in prior games
FR45: System displays the draft pick order number alongside each pick in the draft feed and game history (e.g., "Jake picked Shai · pick #1")

### NonFunctional Requirements

NFR-PERF-1: Time to Interactive (TTI): < 3s on 4G
NFR-PERF-2: First Contentful Paint (FCP): < 1.5s
NFR-PERF-3: Draft feed pick updates: < 3s from submission to visible to all participants
NFR-PERF-4: Live score updates: < 60s from official NBA stat publication
NFR-PERF-5: Mozgov Rule push notification: < 30s from halftime detection
NFR-PERF-6: Mozgov replacement window load: < 2s from app open
NFR-AVAIL-1: 99.5% uptime during draft windows (9am PST open through tip-off) and Mozgov halftime windows (~15 min per game)
NFR-AVAIL-2: No deployments during active draft or game windows; enforced by deploy script checking game state
NFR-SEC-1: HTTPS for all traffic
NFR-SEC-2: Authentication required for all app routes
NFR-SEC-3: RBAC enforced at API layer — UI-level restrictions insufficient
NFR-SEC-4: Preference list data never returned to commissioner or admin roles via API, regardless of request parameters
NFR-INT-1: NBA stats API must provide intra-game updates with player minutes available at halftime (not post-game only); post-game correction events; uptime during playoff windows. Provider evaluation is a pre-development gate
NFR-INT-2: FCM web push for all notification types; latency must meet NFR-PERF-5 target
NFR-SCALE-1: Support tens to low hundreds of total users across all leagues
NFR-SCALE-2: Concurrent draft activity must not produce race conditions on pick assignment or eligibility state (Prisma transaction + unique constraint required)
NFR-ACCESS-1: Semantic HTML for all core flows
NFR-ACCESS-2: Keyboard navigability for pick submission, draft feed, and standings
NFR-ACCESS-3: Color contrast minimum 4.5:1 for normal text (body text on background achieves ~19:1; accent orange achieves ~4.7:1)

### Additional Requirements

**From Architecture:**

- Starter template: T3 Stack via `npx create-t3-app@latest fantasy-finals --nextAuth --prisma --tailwind --trpc --appRouter --noGit`. This is Epic 1 Story 1.
- Add `pg-boss` (PostgreSQL-backed job queue, no Redis) for: selection clock expiry, draft auto-open (9am PST), halftime detection polling, auto-assign triggers, post-game stat correction propagation
- Use `@ducanh2912/next-pwa` (NOT `next-pwa`) — the actively maintained App Router-compatible fork
- Deploy to Railway: persistent Node.js server (not serverless) + pg-boss worker (separate process) + Railway managed PostgreSQL
- GitHub Actions CI/CD: lint + type-check on PR; deploy to Railway on merge to main via Railway deploy hook
- Prisma schema: all models using cuid2 string IDs (`@default(cuid())`), camelCase field names, snake_case DB column mapping via `@map`/`@@map`
- Race condition guard: `@@unique([leagueId, gameId, playerId])` on Pick model — enforced at DB layer
- NextAuth.js: magic link (primary) + Google OAuth (optional); JWT sessions
- RBAC: tRPC middleware context-based; `enforceRole()` as first statement in every protected procedure; `enforceOwner()` for preference list (not role-based — ownership-based)
- NBA stats API abstracted behind `src/server/services/nba-stats.ts` — provider swap requires only this file
- FCM wrapped in `src/server/services/fcm.ts` — sole push notification exit point
- Deploy script must check active game/draft state before allowing Railway deployment
- Procfile for Railway: `web: node .next/standalone/server.js` / `worker: npx ts-node src/worker/index.ts`
- pg-boss job naming: `domain.action` pattern (e.g., `draft.open`, `clock.expire`, `halftime.check`)
- Polling intervals: draft feed `refetchInterval: 3000`; live scores `refetchInterval: 30000`; Mozgov window `refetchInterval: 5000`; disable `refetchIntervalInBackground`
- shadcn/ui: components code-copied into `src/components/ui/` — never modified; theming via CSS custom properties only

**From UX Design:**

- Dark-only theme: zinc-950 background, zinc-900 cards, orange-500 accent; implemented via CSS custom properties in `globals.css`; `darkMode: 'class'` in Tailwind config with `dark` class applied at `<html>` level
- Inter font via `@next/font/google`
- Custom component: `ActiveStateBar` — persistent bottom widget showing clock countdown or Mozgov window state; appears above bottom nav when active; disappears when state resolves
- Custom component: `DragList` — drag-to-reorder preference list using dnd-kit (not react-beautiful-dnd); drag handle per row; touch-compatible
- Custom component: `LiveFeedItem` — draft feed entry with entrance animation; shows participant name + player picked + auto-assign label
- Custom component: `ScoreBadge` — live fantasy points with pulse animation while game is active; settles to static on game end
- Undo snackbar via `Sonner`: 5-second window after pick confirmation, Mozgov replacement confirmation, and preference list save
- Skeleton loading states for all data loads — no full-page spinners anywhere
- Bottom nav: 3 items maximum (Draft/Game, Standings, League)
- Minimum tap target: 44px height on all interactive elements; player pick cards min-height 64px (~72px hybrid per design direction)
- Push notifications must deep-link to exact screen: turn notification → `/draft/[gameId]/pick`; Mozgov notification → `/draft/[gameId]/mozgov`; draft open → preference list
- Mozgov notification copy must be plain English: "Your player sat the first half. You have X min to replace them — they earn full game credit, every point counts."
- Clock visual escalation: orange-500 (calm) → red-500 (final 10 min for regular draft; final minute for Mozgov 3-min clock)
- Commissioner override accessible in 2 taps from game context — no separate admin dashboard navigation required
- Preference list discoverability: "draft opens tomorrow" notification must include CTA to set preference list; first-time draft participants prompted before their first clock starts
- PWA installability: `manifest.json` + service worker; push notification subscription via service worker; PWA install prompt on Chrome/Android and Safari "Add to Home Screen"
- Player list sorted by series fantasy avg descending; used players dimmed (not hidden); selected player highlighted with orange left border
- Player row (~72px): name + team + home/away indicator + series avg + last game total; tap to expand for Pts/Reb/Ast/Stl/Blk breakdown with scoring multipliers

### FR Coverage Map

| FR | Epic | Description |
|---|---|---|
| FR1 | Epic 2 | Create league scoped to NBA playoff series |
| FR2 | Epic 2 | Generate & share invite links |
| FR3 | Epic 2 | Delegate commissioner role |
| FR4 | Epic 2 | Multi-league management |
| FR5 | Epic 2 | Admin cross-league view & actions |
| FR6 | Epic 2 | Join league via invite link |
| FR7 | Epic 2 | Restrict access to invited participants |
| FR8 | Epic 3 | Player eligibility enforcement (active, per-person exclusivity, no double-draft) |
| FR9 | Epic 3 | Draft order: random Game 1, inverse standings thereafter, tie-breaker |
| FR10 | Epic 3 | Draft order publish timing, 9am PST window open, sequential clocks |
| FR11 | Epic 3 | Personalized eligible player list (used players dimmed, not hidden) |
| FR12 | Epic 3 | Submit pick during draft turn |
| FR13 | Epic 3 | Per-pick selection clock (up to 1 hour) |
| FR14 | Epic 3 | Auto-assign on clock expiry (preference list or system random) |
| FR15 | Epic 3 | Auto-assign labels: `auto — preference list` / `auto — system` |
| FR16 | Epic 3 | Real-time draft feed |
| FR17 | Epic 3 | Ranked preference list creation & management |
| FR18 | Epic 3 | Preference list game-to-game persistence with eligibility filter |
| FR19 | Epic 3 | Preference list private to participant (API-enforced) |
| FR20 | Epic 3 | Explicit pick confirmation before finalizing |
| FR21 | Epic 3 | Commissioner pick override |
| FR22 | Epic 5 | Halftime detection: active player < 5 minutes triggers Mozgov Rule |
| FR23 | Epic 5 | Replacement window: simultaneous notify, sequential 3-min clock, tip-off deadline |
| FR24 | Epic 5 | Replacement player eligibility (active, 5+ min in most recent active game, not used) |
| FR25 | Epic 5 | Original voided; replacement earns full-game fantasy credit |
| FR26 | Epic 4 | Quarterly box score retrieval (Q1, halftime, Q3, final) |
| FR27 | Epic 4 | Fantasy scoring: 1×PTS + 2×REB + 2×AST + 3×STL + 3×BLK |
| FR28 | Epic 4 | Live score display with LIVE · Q[n] and FINAL indicators |
| FR29 | Epic 6 | Post-game stat corrections applied automatically |
| FR30 | Epic 6 | Standings & draft order recalculated on correction |
| FR31 | Epic 6 | Correction propagation completes before next draft window |
| FR32 | Epic 6 | Series leaderboard with cumulative fantasy points |
| FR33 | Epic 6 | Per-game stat breakdown (Pts/Reb/Ast/Stl/Blk/Fantasy Total) |
| FR34 | Epic 6 | Per-category leaders highlighted; burned player list visible |
| FR35 | Epic 3 | Push notification: draft order published + draft window opens (with preference list CTA) |
| FR36 | Epic 3 | Push notification: your turn, deep-link to pick screen |
| FR37 | Epic 3 | Push notification: pick reminder at <10 min on clock |
| FR38 | Epic 5 | Push notification: Mozgov Rule triggered |
| FR39 | Epic 4 | Push notification: game results & standings posted |
| FR40 | Epic 1 | FCM web push infrastructure (all notification types) |
| FR41 | Epic 1 | User registration & authentication (magic link + Google OAuth) |
| FR42 | Epic 1 | RBAC: participant, commissioner, admin roles |
| FR43 | Epic 1 | Preference list API-layer privacy guard |
| FR44 | Epic 3 | Series-long draft history view |
| FR45 | Epic 3 | Draft pick order number displayed in feed and history |

## Epic List

### Epic 1: Platform Foundation — App Shell, Auth & Infrastructure
Users can access a working, authenticated app shell. A participant can receive an invite link, register, log in, and land on a dashboard. The complete technical foundation (T3 Stack, Railway, Prisma schema, pg-boss worker scaffold, PWA, FCM infrastructure, design system) is in place for all future epics to build on.

**FRs covered:** FR40, FR41, FR42, FR43
**Architecture stories:** T3 Stack init, Railway + PostgreSQL provisioning, Prisma schema (all models), NextAuth.js (magic link + Google OAuth), RBAC tRPC middleware, pg-boss worker scaffold, shadcn/ui + dark theme + design tokens, CI/CD pipeline, PWA manifest + service worker

---

### Epic 2: League Management & Invitations
A commissioner can create a league scoped to an NBA playoff series, invite friends via a shareable link, delegate the commissioner role, and manage multiple independent leagues. Participants can join via invite link. Admin has cross-league visibility and controls.

**FRs covered:** FR1, FR2, FR3, FR4, FR5, FR6, FR7

---

### Epic 3: The Draft — Player Selection & Automated Flow
Participants receive draft turn notifications, browse eligible players, pick under a sequential timed clock, confirm their pick, and see results in a real-time feed. Auto-assign fires from the preference list when the clock expires. Commissioner can override any pick. Series-long draft history and pick order numbers are visible.

**FRs covered:** FR8, FR9, FR10, FR11, FR12, FR13, FR14, FR15, FR16, FR17, FR18, FR19, FR20, FR21, FR35, FR36, FR37, FR44, FR45

---

### Epic 4: Live Game Scoring & Results Notification
Participants can watch their player's fantasy point total update at the end of each quarter during a live game. The standings display LIVE · Q[n] and FINAL indicators. A push notification fires when game results and updated standings are posted.

**FRs covered:** FR26, FR27, FR28, FR39

---

### Epic 5: The Mozgov Rule — Halftime Replacement Window
When a drafted player is active but logs fewer than 5 first-half minutes, the system detects it, notifies the affected participant(s), and opens a sequential 3-minute replacement window in draft order. The original player's stats are voided; the replacement earns full-game credit. Multiple simultaneous triggers resolved in draft order.

**FRs covered:** FR22, FR23, FR24, FR25, FR38

---

### Epic 6: Standings, Category Leaders & Post-Game Corrections
The full series leaderboard shows cumulative fantasy points. Per-game stat breakdowns (Pts/Reb/Ast/Stl/Blk/Fantasy Total) display with per-category leaders highlighted. Post-game official stat corrections propagate automatically, recalculating standings and draft order before the next draft window opens.

**FRs covered:** FR29, FR30, FR31, FR32, FR33, FR34

---

## Epic 1: Platform Foundation — App Shell, Auth & Infrastructure

Users can access a working, authenticated app shell. A participant can receive an invite link, register, log in, and land on a dashboard. The complete technical foundation (T3 Stack, Railway, Prisma schema, pg-boss worker scaffold, PWA, FCM infrastructure, design system) is in place for all future epics to build on.

**FRs covered:** FR40, FR41, FR42, FR43

### Story 1.1: Project Scaffold & Deployment Pipeline

As a developer,
I want the project initialized with the T3 Stack and deployed to Railway with a working CI/CD pipeline,
So that the team has a runnable app and automated deployment from day one.

**Acceptance Criteria:**

**Given** the T3 Stack init command is run (`npx create-t3-app@latest fantasy-finals --nextAuth --prisma --tailwind --trpc --appRouter --noGit`)
**When** the project is pushed to GitHub
**Then** GitHub Actions runs lint and type-check on every PR
**And** a successful merge to main triggers a Railway deploy via deploy hook

**Given** the Railway project is provisioned
**When** the app is deployed
**Then** the Next.js server runs as a persistent Node.js process (not serverless)
**And** Railway managed PostgreSQL is connected via `DATABASE_URL`
**And** the app is accessible at the Railway-provided URL over HTTPS

**Given** the `.env.example` file exists
**When** a developer clones the repo
**Then** all required environment variables are documented with descriptions
**And** the app boots locally with `pnpm dev` without errors

---

### Story 1.2: User Authentication — Magic Link & Google OAuth

As a user,
I want to register and sign in using a magic link sent to my email or my Google account,
So that I can access the platform securely without managing a password.

**Acceptance Criteria:**

**Given** I visit the app unauthenticated
**When** I request a magic link with my email address
**Then** I receive an email with a sign-in link
**And** clicking the link signs me in and redirects me to the dashboard

**Given** I visit the app unauthenticated
**When** I click "Sign in with Google"
**Then** I am redirected through the Google OAuth flow
**And** on success I am signed in and redirected to the dashboard

**Given** I am authenticated
**When** I navigate to any app route
**Then** my session is maintained via NextAuth.js JWT

**Given** I am unauthenticated
**When** I attempt to access any auth-gated route directly
**Then** I am redirected to the sign-in page

---

### Story 1.3: Role-Based Access Control

As a platform user,
I want my role (participant, commissioner, or admin) enforced at the API layer,
So that commissioners can manage their leagues and my preference list stays private regardless of how requests are made.

**Acceptance Criteria:**

**Given** a tRPC procedure requires the commissioner role
**When** a participant calls it
**Then** the server returns a FORBIDDEN error before any logic executes
**And** the role check happens in tRPC middleware, not in a React component

**Given** I am a participant attempting to read another participant's preference list
**When** the tRPC preference list procedure is called with any userId
**Then** the server returns FORBIDDEN if the caller's userId does not match the requested userId
**And** this is enforced via `enforceOwner()` regardless of the caller's role

**Given** an admin user
**When** they call a preference list read procedure for any other participant
**Then** they receive a FORBIDDEN error — admin role does not override preference list privacy

---

### Story 1.4: App Shell, Design System & PWA

As a user,
I want a polished, installable app with dark theme, consistent navigation, and skeleton loading states,
So that the experience feels native on my phone and I can install it to my home screen.

**Acceptance Criteria:**

**Given** I open the app
**When** it loads
**Then** the dark zinc-950 background, zinc-900 cards, and orange-500 accent are applied via CSS custom properties in `globals.css`
**And** Inter font is loaded via `@next/font/google`
**And** bottom navigation shows 3 items (Draft/Game, Standings, League)

**Given** data is loading on any screen
**When** the fetch is in progress
**Then** shadcn/ui Skeleton components appear in the layout shape
**And** no full-page spinner is shown

**Given** I am on Chrome/Android or Safari/iOS
**When** the PWA install conditions are met
**Then** an install prompt is available (Chrome) or "Add to Home Screen" works (Safari)
**And** the app displays with the PWA manifest name, icons, and dark theme-color

**Given** I am using a screen reader or keyboard navigation
**When** I interact with pick submission, draft feed, or standings
**Then** all elements are reachable via Tab key
**And** semantic HTML elements are used throughout (no `div` buttons)

---

### Story 1.5: FCM Web Push Infrastructure

As a user,
I want to opt in to push notifications so the app can alert me when it's my turn to pick or game events occur,
So that I never miss a draft turn or Mozgov window.

**Acceptance Criteria:**

**Given** I am authenticated and viewing the app for the first time
**When** I am prompted to enable notifications
**Then** my browser's push permission dialog appears
**And** on approval my push subscription is saved to the database linked to my user account

**Given** a pg-boss job or tRPC mutation calls `fcm.ts` with a notification payload
**When** FCM sends the push
**Then** my device receives the notification even if the app is closed
**And** the service worker handles the incoming push event and displays the notification

**Given** I have push notifications enabled
**When** I revoke browser permission
**Then** subsequent notification sends to my subscription fail gracefully without crashing the server

---

### Story 1.6: Background Job Worker

As a commissioner,
I want picks, draft timers, and game events to execute automatically without any manual intervention,
So that the league runs itself and I never have to manually trigger draft opens, clock expirations, or score updates.

**Acceptance Criteria:**

**Given** the Railway project is running
**When** both processes start
**Then** the Next.js web server runs on the web process
**And** the pg-boss worker runs as a separate worker process
**And** both connect to the same Railway PostgreSQL instance via Prisma

**Given** a job is enqueued using the `domain.action` naming convention (e.g., `draft.open`, `clock.expire`)
**When** the worker is running
**Then** the job is picked up and executed by the registered handler
**And** job errors are logged to Railway without silently swallowing exceptions
**And** failed jobs are retried via pg-boss retry configuration

**Given** the `Procfile` exists at the project root
**When** Railway starts the project
**Then** both `web` and `worker` processes start from the same repo

**Given** a selection clock expires with no commissioner action
**When** the `clock.expire` job fires
**Then** the auto-assign executes automatically and the participant's pick appears in the draft feed with no commissioner involvement

---

## Epic 2: League Management & Invitations

A commissioner can create a league scoped to an NBA playoff series, invite friends via a shareable link, delegate the commissioner role, and manage multiple independent leagues. Participants can join via invite link. Admin has cross-league visibility and controls.

**FRs covered:** FR1, FR2, FR3, FR4, FR5, FR6, FR7

### Story 2.1: Create a League

As a commissioner,
I want to create a league scoped to a specific NBA playoff series,
So that my friend group has a place to play.

**Acceptance Criteria:**

**Given** I am authenticated with the commissioner role
**When** I fill out the league creation form (league name, series selection, selection clock duration)
**Then** a new league is created and I am automatically added as both commissioner and first participant
**And** I am redirected to the league home page

**Given** I am on the league creation form
**When** I select the playoff series
**Then** the series options reflect available NBA playoff matchups (teams + game schedule)

**Given** a league exists
**When** a non-member attempts to access it directly via URL
**Then** they receive an access denied response

---

### Story 2.2: Generate & Share Invite Links

As a commissioner,
I want to generate a shareable invite link for my league,
So that friends can join without me manually adding them.

**Acceptance Criteria:**

**Given** I am the commissioner of a league
**When** I open league settings
**Then** I can see a generated invite link with a unique token
**And** I can copy it to my clipboard with one tap

**Given** an invite link exists
**When** I choose to regenerate it
**Then** the old token is invalidated
**And** a new token is generated and ready to share

---

### Story 2.3: Join a League via Invite Link

As a user,
I want to join a league by clicking an invite link,
So that I can start participating without the commissioner adding me manually.

**Acceptance Criteria:**

**Given** I click a valid invite link while unauthenticated
**When** I complete sign-in (magic link or Google OAuth)
**Then** I am automatically added to the league as a participant
**And** I am redirected to the league home page with context about what the league is

**Given** I click a valid invite link while already authenticated
**When** the join page loads
**Then** I am added to the league immediately
**And** redirected to the league home with my participant status shown

**Given** I am already a member of a league
**When** I click the same invite link again
**Then** I am redirected to the league home without being added twice

**Given** someone clicks an invalid or revoked invite link
**When** the join page loads
**Then** they see a clear error message (invite link invalid or expired)

---

### Story 2.4: Commissioner Delegation

As a commissioner,
I want to transfer the commissioner role to another participant,
So that I can hand off management to someone else.

**Acceptance Criteria:**

**Given** I am the commissioner of a league with at least one other participant
**When** I select another participant and confirm delegation
**Then** that participant's role is updated to commissioner
**And** my role is updated to participant
**And** the change takes effect immediately (new commissioner gains full permissions on next action)

**Given** the new commissioner is now active
**When** they access commissioner-only controls
**Then** those controls are available and functional

---

### Story 2.5: Multi-League Dashboard

As a user,
I want a dashboard showing all my leagues with current status,
So that I can quickly navigate between multiple leagues and know what needs my attention.

**Acceptance Criteria:**

**Given** I am a member of one or more leagues (in any role)
**When** I open the dashboard
**Then** each league is shown as a card with: league name, current game number, my current standings position
**And** any league where it's my draft turn is visually indicated as requiring action

**Given** I am a commissioner
**When** I create a second league
**Then** both leagues appear on my dashboard independently
**And** participant data, picks, and standings never cross between leagues

**Given** I have no league memberships
**When** I open the dashboard
**Then** I see a prompt to create a league or paste an invite link

---

### Story 2.6: Admin Cross-League Panel

As an admin,
I want to view all leagues across the platform and take corrective actions,
So that I can resolve issues in any league without being a member.

**Acceptance Criteria:**

**Given** I am an admin
**When** I navigate to `/admin`
**Then** I see a list of all leagues across the platform with: league name, commissioner, participant count, current game status

**Given** I am an admin viewing a specific league
**When** I trigger a draft order recalculation for that league
**Then** the recalculation runs and standings/draft order are updated

**Given** I am an admin
**When** I attempt to read any participant's preference list through the admin panel
**Then** I receive a FORBIDDEN error — admin cross-league access does not bypass preference list privacy

---

## Epic 3: The Draft — Player Selection & Automated Flow

Participants receive draft turn notifications, browse eligible players, pick under a sequential timed clock, confirm their pick, and see results in a real-time feed. Auto-assign fires from the preference list when the clock expires. Commissioner can override any pick. Series-long draft history and pick order numbers are visible.

**FRs covered:** FR8, FR9, FR10, FR11, FR12, FR13, FR14, FR15, FR16, FR17, FR18, FR19, FR20, FR21, FR35, FR36, FR37, FR44, FR45

### Story 3.1: NBA Stats API Integration

As a participant,
I want live game stats to appear in the app during games,
So that I can see my player's current fantasy point total and the app can enforce player eligibility correctly.

**Acceptance Criteria:**

**Given** an NBA game is in progress
**When** I view the standings or my player's stats
**Then** I see current box score data (points, rebounds, assists, steals, blocks) reflecting the most recent quarter update

**Given** the `nba-stats.ts` service module exists in `src/server/services/`
**When** any part of the system needs box score or roster data
**Then** it calls `nbaStatsService` — never makes raw HTTP calls to the NBA provider inline in a router or job

**Given** the `nba-stats.ts` service is configured to use `nba_api` / stats.nba.com
**When** the service fetches a live box score or game roster
**Then** it uses a custom `User-Agent` header and a 3–5s minimum interval between requests to avoid rate-limiting
**And** a provider swap to a paid API (e.g., BallDontLie GOAT) requires changes only to `nba-stats.ts`

**Given** the NBA stats API is unavailable, slow, or returns an error (including IP block)
**When** the service is called
**Then** the error is caught and logged to Railway without crashing the worker or server
**And** the app displays the last known stats rather than an error screen

---

### Story 3.2: Fantasy Scoring Engine

As a participant,
I want my player's fantasy points calculated correctly and consistently,
So that I can trust the standings and know exactly how points are earned.

**Acceptance Criteria:**

**Given** a player's raw box score stats (PTS, REB, AST, STL, BLK)
**When** `scoring.ts` calculates fantasy points
**Then** it returns: `(1 × PTS) + (2 × REB) + (2 × AST) + (3 × STL) + (3 × BLK)` as an integer
**And** the function has no database calls, no external calls — pure input/output

**Given** the scoring function is tested
**When** the test suite runs
**Then** known stat lines produce exact expected fantasy totals (e.g., 17 PTS, 4 REB, 6 AST, 1 STL, 0 BLK → 17 + 8 + 12 + 3 + 0 = 40)

---

### Story 3.3: Draft Order Generation

As a participant,
I want the draft order generated automatically — random for Game 1 and inverse standings for subsequent games,
So that every game starts fairly without anyone doing manual math.

**Acceptance Criteria:**

**Given** Game 1 of a series is starting
**When** the draft order is generated
**Then** the order is randomized across all league participants
**And** each participant's pick position (1 through N) is stored and visible

**Given** Game 2 or later is starting
**When** the draft order is generated
**Then** participants are ordered by inverse cumulative fantasy series score (lowest score picks first)
**And** if two participants have equal cumulative scores, the one with the higher draft pick number from the prior game picks earlier

**Given** the draft order is published
**When** a participant views the league
**Then** they can see the full draft order for the upcoming game

---

### Story 3.4: Draft Window & Selection Clock

As a participant,
I want the draft window to open automatically at 9am PST the morning after a game with sequential 1-hour clocks,
So that I have the whole morning to make my pick without anyone chasing me down.

**Acceptance Criteria:**

**Given** a game has concluded and final scores are confirmed
**When** the `draft.order-publish` pg-boss job fires (scheduled 30 minutes after final score confirmation)
**Then** the draft order for the next game is published and all participants receive a push notification

**Given** draft order has been published
**When** 9am PST arrives the following morning
**Then** the `draft.open` pg-boss job fires, the draft window opens automatically, and the first participant's selection clock starts

**Given** the `draft.open` job fails or does not fire at 9am PST
**When** the system detects the job missed its schedule (via pg-boss retry)
**Then** the job retries automatically and the window opens as soon as the retry succeeds
**And** the commissioner is not required to manually intervene

**Given** a participant's selection clock is running
**When** they submit their pick
**Then** the clock stops and the next participant's clock starts immediately

**Given** the draft window is open
**When** the next game's tip-off time is reached
**Then** the draft window closes and no further picks are accepted

---

### Story 3.5: Eligible Player List

As a participant,
I want to browse a personalized, sorted list of eligible players during my draft turn,
So that I can quickly find and evaluate my options before the clock runs out.

**Acceptance Criteria:**

**Given** it is my draft turn
**When** I open the pick screen
**Then** I see a list of eligible players sorted by series fantasy average descending
**And** each player row (~72px) shows: name, team, home/away indicator, series avg, last game total
**And** the screen loads within 3s on 4G

**Given** I have already used a player earlier in this series
**When** I view the eligible player list
**Then** that player appears dimmed and non-selectable with a "used" indicator
**And** the player is not hidden — I can still see them in the list

**Given** I tap a player row
**When** it expands
**Then** I see the full scoring breakdown: Pts (×1), Reb (×2), Ast (×2), Stl (×3), Blk (×3) with last game values and fantasy subtotals

**Given** the system checks eligibility
**When** determining who is eligible
**Then** a player is only shown as selectable if: (a) active for tonight's game, (b) not previously used by me in this series, and (c) not already picked by anyone in this game

---

### Story 3.6: Pick Submission & Confirmation

As a participant,
I want to tap a player, confirm my pick, and have a 5-second undo window,
So that I feel certain my selection is locked in correctly without fear of accidental taps.

**Acceptance Criteria:**

**Given** I have selected a player on the pick screen
**When** I tap "Confirm Pick"
**Then** a confirmation dialog appears showing the player name and team
**And** tapping "Confirm" in the dialog finalizes the pick

**Given** my pick is confirmed
**When** the success state appears
**Then** I see a green banner with the player name and "Your pick is in"
**And** a Sonner snackbar appears offering "Undo" for 5 seconds

**Given** the 5-second undo window is active
**When** I tap "Undo"
**Then** the pick is cancelled and I return to the player list to re-pick

**Given** 5 seconds pass after confirmation
**When** the undo window expires
**Then** the pick is locked and cannot be changed (except by commissioner override)

**Given** I try to pick a player who was just taken by another participant in a concurrent draft
**When** my confirmation is submitted
**Then** the server rejects it with "Player already picked" and I see an error
**And** the pick is never finalized (Prisma transaction + unique constraint enforced)

---

### Story 3.7: Real-Time Draft Feed

As a participant,
I want to see all picks appear in real time as they're submitted — with pick order numbers and auto-assign labels,
So that I know exactly what's happening in the draft as it unfolds.

**Acceptance Criteria:**

**Given** the draft window is open
**When** any participant submits a pick
**Then** it appears in the draft feed for all other participants within 3 seconds
**And** each feed entry shows: participant name, player picked, draft pick number (e.g., "pick #3"), and auto-assign label if applicable

**Given** the draft feed is visible
**When** it is actively updating
**Then** a "DRAFT OPEN" indicator is shown at the top of the feed
**And** new picks appear with a subtle entrance animation (LiveFeedItem component)

**Given** the draft has closed (tip-off reached or all picks submitted)
**When** I view the draft feed
**Then** the feed shows the complete static pick history with no live indicator

**Given** the tab is not focused
**When** the poll interval fires
**Then** polling is paused (`refetchIntervalInBackground: false`) to avoid unnecessary requests

---

### Story 3.8: Preference List Management

As a participant,
I want to create and maintain a ranked preference list before my draft turn,
So that my picks are automatically submitted in my preferred order if I can't be there when my clock runs.

**Acceptance Criteria:**

**Given** I am a league participant
**When** I open the preference list screen at any time (including before draft order is published)
**Then** I can add eligible players to my ranked list and reorder them by dragging

**Given** I reorder my preference list
**When** I drag a player row using the drag handle
**Then** the list reorders in real time (dnd-kit, touch-compatible)
**And** saving the list persists the order to the server

**Given** a prior game's preference list exists
**When** the `draft.order-publish` job fires (~30 minutes after final scores)
**Then** the list is immediately updated: players already used by this participant in the series are silently removed, and the remaining players retain their relative order
**And** this cleanup happens before draft order notifications are sent, so participants see a clean list when they open the app

**Given** I try to add a player to my preference list who I have already used in the current series
**When** I tap to add them
**Then** they appear dimmed and non-selectable with a "Already used" label
**And** they cannot be added to the list

**Given** I am authenticated
**When** any other participant or the commissioner attempts to read my preference list via tRPC
**Then** they receive a FORBIDDEN error

**Given** it is my first time drafting in a league
**When** my selection clock starts
**Then** I am shown a prompt to set my preference list if I haven't already

---

### Story 3.9: Auto-Assign on Clock Expiry

As a participant who can't pick in time,
I want the system to automatically select my top eligible preference list player when my clock expires,
So that I never forfeit my pick even when I'm unavailable.

**Acceptance Criteria:**

**Given** my selection clock expires
**When** the `clock.expire` pg-boss job fires
**Then** the system reads my preference list and selects the first eligible player
**And** the pick is submitted automatically and labeled `auto — preference list`

**Given** my clock expires and I have no preference list set
**When** the `clock.expire` pg-boss job fires
**Then** the system selects a random eligible player
**And** the pick is labeled `auto — system`

**Given** my clock expires and all eligible players have been exhausted (all used by me this series or already drafted in this game)
**When** the `clock.expire` job fires and finds no eligible player
**Then** no pick is submitted
**And** the commissioner is notified via push notification that a pick could not be auto-assigned
**And** the slot is flagged in the draft feed as "No eligible players — commissioner action required"

**Given** my pick was auto-assigned
**When** I next open the app
**Then** I see the auto-assign outcome showing what was picked and why (preference list position used, or "system assigned" if no list)
**And** a nudge to set my preference list is shown for next game if `auto — system` was used

---

### Story 3.10: Commissioner Pick Override

As a commissioner,
I want to override any participant's submitted pick,
So that I can correct mistakes or handle edge cases during a live draft.

**Acceptance Criteria:**

**Given** I am the commissioner viewing a game's picks
**When** I long-press (or tap the ⋯ menu) on any submitted pick in the draft feed
**Then** an "Override Pick" option appears
**And** tapping it opens a player selection modal showing only currently eligible players

**Given** I confirm an override
**When** the override is submitted
**Then** the original pick is replaced immediately
**And** the draft feed updates to show the corrected pick for all participants

**Given** the overridden pick appears in the draft feed and history
**When** any participant views it
**Then** it is labeled with an indicator that it was commissioner-overridden

---

### Story 3.11: Draft Notifications

As a participant,
I want push notifications when the draft order is published, when it's my turn, and when my clock is almost up,
So that I never miss my window to pick.

**Acceptance Criteria:**

**Given** the draft order for the next game is published (~30 min after final scores)
**When** the notification fires
**Then** I receive a push notification with a direct link to set or review my preference list

**Given** the draft window opens at 9am PST
**When** the `draft.open` job fires
**Then** all league participants receive a "draft is open" push notification

**Given** it is my turn to pick
**When** the previous participant submits (or their clock expires)
**Then** I receive a push notification deep-linking directly to `/league/[leagueId]/draft`
**And** the notification copy makes clear it is my turn

**Given** fewer than 10 minutes remain on my selection clock
**When** the reminder fires
**Then** I receive a push notification reminding me to pick before auto-assign fires
**And** the notification deep-links directly to the pick screen

---

### Story 3.12: Series Draft History

As a participant,
I want to view the complete draft history for the current series,
So that I can track all picks from every prior game, see draft pick order numbers, and know each participant's burned player list.

**Acceptance Criteria:**

**Given** I am viewing the history page
**When** it loads
**Then** I see each completed game in the series with every participant's pick listed
**And** each pick shows: participant name, player name, draft pick number (e.g., "pick #3"), and any auto-assign or override labels

**Given** a participant has used players in prior games
**When** I view the history
**Then** their burned players are visible to all league participants across all games

**Given** I am planning my next pick
**When** I view the history page
**Then** I can clearly see which players I have already used this series

---

## Epic 4: Live Game Scoring & Results Notification

Participants can watch their player's fantasy point total update at the end of each quarter during a live game. The standings display LIVE · Q[n] and FINAL indicators. A push notification fires when game results and updated standings are posted.

**FRs covered:** FR26, FR27, FR28, FR39

### Story 4.1: Quarterly Score Updates

As a participant,
I want my player's fantasy point total to update at the end of each quarter during a live game,
So that I can track how my pick is performing without refreshing manually.

**Acceptance Criteria:**

**Given** a game is in progress
**When** the `scores.poll` pg-boss job fires every 60 seconds during active game windows
**Then** the system fetches the current box score from stats.nba.com via `nba-stats.ts`
**And** fantasy points are recalculated for all picks in that game using `scoring.ts`
**And** the updated totals are written to the database and visible to participants within 60 seconds of the official stat publication

**Given** a game is active
**When** I view my player's score
**Then** a "LIVE · Q[n]" indicator shows the current quarter (derived from the box score period field)
**And** the ScoreBadge pulses while the game is active and settles to static on "FINAL"

**Given** no game is currently active
**When** I view scores
**Then** the `scores.poll` job is not scheduled — no API calls are made outside active game windows

**Given** the box score shows a period transition (e.g., period changes from 1 → 2)
**When** the next poll result arrives
**Then** the quarter indicator updates automatically — no separate job or event is needed to detect quarter boundaries

---

### Story 4.2: Results Push Notification

As a participant,
I want a push notification when game results and updated standings are posted,
So that I know immediately when the final scores are in and can check the leaderboard.

**Acceptance Criteria:**

**Given** a game has ended and final scores are confirmed
**When** the results notification fires
**Then** all league participants receive a push notification indicating results are posted
**And** the notification deep-links to the standings page for that league

**Given** I tap the results notification
**When** the app opens
**Then** I land directly on the standings page showing the final scores for that game
**And** the "FINAL" indicator is shown on all scores (no LIVE badge)

---

## Epic 5: The Mozgov Rule — Halftime Replacement Window

When a drafted player is active but logs fewer than 5 first-half minutes, the system detects it, notifies the affected participant(s), and opens a sequential 3-minute replacement window in draft order. The original player's stats are voided; the replacement earns full-game credit. Multiple simultaneous triggers resolved in draft order.

**FRs covered:** FR22, FR23, FR24, FR25, FR38

### Story 5.1: Halftime Detection & Manual Mozgov Trigger

As a commissioner,
I want to be able to open the Mozgov replacement window — either automatically when the system detects a qualifying player, or manually when I see a player hasn't played — so that the Mozgov Rule can always be applied regardless of whether auto-detection succeeds.

**Acceptance Criteria:**

**Given** a game reaches halftime
**When** the `halftime.check` pg-boss job fires every 30 seconds during the halftime window
**Then** the system fetches current player minutes from stats.nba.com via `nba-stats.ts`
**And** for each pick in that game, checks if the player is active (not DNP/injured) and has played fewer than 5 minutes

**Given** an active player has played fewer than 5 minutes at halftime
**When** the automated check completes
**Then** a `MozgovWindow` record is created for that participant in that game
**And** the affected participant receives a push notification within 30 seconds of detection

**Given** a player has a DNP designation (injured or inactive)
**When** the halftime check runs
**Then** that player does NOT trigger the Mozgov Rule — the rule only applies to active players who failed to reach the threshold

**Given** no players trigger the Mozgov Rule in a game
**When** the halftime check completes
**Then** no replacement windows are opened and no notifications are sent

**Given** the stats.nba.com API is unavailable or returns a stale/blocked response during halftime
**When** the `halftime.check` job fires
**Then** the error is logged, the job retries on the next 30-second interval, and no window is opened until valid data is confirmed

**Given** I am a commissioner viewing a game in progress
**When** I open the League Settings for that game
**Then** I can see each participant's current pick and a "Trigger Mozgov" button next to any pick
**And** tapping "Trigger Mozgov" for a participant opens their replacement window immediately, regardless of auto-detection status
**And** the manually-triggered window behaves identically to an auto-triggered one (same eligibility rules, same sequential clock, same scoring credit)

---

### Story 5.2: Mozgov Replacement Window & Sequential Clock

As a participant whose drafted player triggered the Mozgov Rule,
I want to be notified immediately and given a 3-minute clock to select a replacement,
So that I can act quickly without panicking.

**Acceptance Criteria:**

**Given** the Mozgov Rule is triggered for one or more participants
**When** the system opens the replacement window
**Then** all affected participants are notified simultaneously via push notification
**And** the notification copy is plain English: "Your player sat the first half. You have 3 min to replace them — they earn full game credit, every point counts."
**And** the notification deep-links directly to `/league/[leagueId]/draft/mozgov`

**Given** multiple participants have Mozgov triggered in the same game
**When** the replacement window opens
**Then** the participant who picked **last** in that game's draft order selects first in the Mozgov window (inverse draft order)
**And** subsequent participants' clocks do not start until the prior participant picks or their clock expires
**And** example: if Game 3 draft order was A=pick#1, B=pick#2, C=pick#3, and both A and C trigger Mozgov, then C selects first (picked last) and A selects second (picked first)

**Given** it is my turn in the Mozgov window
**When** the replacement screen loads
**Then** it loads within 2 seconds of opening
**And** I see: my player's name + "played X minutes", a countdown timer (3:00), and the eligible replacement list
**And** the ActiveStateBar shows the Mozgov state with red theme and countdown on every screen

**Given** my 3-minute clock expires without a pick
**When** the clock runs out
**Then** the system auto-assigns my replacement using my preference list (or system random if no list)
**And** the next triggered participant's clock starts

**Given** second-half tip-off is reached
**When** any remaining Mozgov clocks are still running
**Then** all remaining windows close immediately and auto-assign fires for any unresolved participants

---

### Story 5.3: Mozgov Replacement Eligibility & Player List

As a participant in a Mozgov replacement window,
I want to see a pre-filtered list of eligible replacement players,
So that I can make a valid selection quickly without guessing who qualifies.

**Acceptance Criteria:**

**Given** I am in the Mozgov replacement window
**When** the eligible player list loads
**Then** it shows only players who meet all three criteria: (a) active for tonight's game, (b) played 5 or more minutes in the most recent game in which they were active — not necessarily the immediately prior game by number (accounts for players who missed games due to injury), and (c) not already used by me in the current series

**Given** a player was injured and missed one or more prior games
**When** their eligibility is evaluated for Mozgov replacement
**Then** the system looks at the most recent game (by game number) in which they have a recorded box score entry with minutes played > 0
**And** if they played 5+ minutes in that game, they are eligible
**And** example: Player X played 6 min in Game 1, missed Games 2–3 due to injury, and is active in Game 4 — the system evaluates Game 1 (most recent active game), finds 6 min, and Player X appears in the eligible replacement list

**Given** I tap a player in the replacement list
**When** the row expands
**Then** I see their stats from the first half of tonight's game (if available) to help inform my decision

---

### Story 5.4: Replacement Scoring — Void Original, Full Game Credit

As a participant who selected a Mozgov replacement,
I want the original player's stats voided and my replacement credited with full-game fantasy points,
So that the replacement is meaningful and every stat from both halves counts.

**Acceptance Criteria:**

**Given** I confirm a Mozgov replacement
**When** the replacement is submitted
**Then** the original player's fantasy points are set to zero for this game
**And** the replacement player's complete box score for the entire game — both halves, all categories — is used to calculate my fantasy total

**Given** the replacement is confirmed
**When** the confirmation screen appears
**Then** it explicitly states: "[Player Name] — Full game credit. Every point counts." with a Sonner snackbar offering 5-second undo

**Given** the game ends with a Mozgov replacement active
**When** final scores are calculated
**Then** the replacement player's complete game stats (PTS/REB/AST/STL/BLK, both halves) feed through `scoring.ts`
**And** the original player shows 0 fantasy points in the standings and game history

**Given** a Mozgov replacement appears in the draft feed and history
**When** any participant views it
**Then** it is labeled "(Mozgov)" to distinguish it from a standard pick

---

## Epic 6: Standings, Category Leaders & Post-Game Corrections

The full series leaderboard shows cumulative fantasy points. Per-game stat breakdowns (Pts/Reb/Ast/Stl/Blk/Fantasy Total) display with per-category leaders highlighted. Post-game official stat corrections propagate automatically, recalculating standings and draft order before the next draft window opens.

**FRs covered:** FR29, FR30, FR31, FR32, FR33, FR34

### Story 6.1: Series Leaderboard

As a participant,
I want to see a live series leaderboard showing everyone's cumulative fantasy points,
So that I always know where I stand relative to the rest of the league.

**Acceptance Criteria:**

**Given** one or more games have been played in the series
**When** I open the standings page
**Then** I see all participants ranked by cumulative fantasy points, highest to lowest
**And** my own position is visually highlighted

**Given** a game is currently in progress
**When** I view the leaderboard
**Then** a "LIVE · Q[n]" indicator is shown and scores reflect the most recent quarterly update
**And** the leaderboard automatically reflects the latest scores without requiring a manual refresh

**Given** a game has just ended
**When** final scores are confirmed
**Then** the leaderboard updates to show "FINAL" and the cumulative standings are recalculated

---

### Story 6.2: Per-Game Stat Breakdown

As a participant,
I want to expand any game in the standings to see every participant's full stat line for that game,
So that I can understand exactly how the scores were earned and compare performances.

**Acceptance Criteria:**

**Given** I am viewing the standings page
**When** I tap a completed game
**Then** I see the full per-game stat breakdown for all participants: player name, Pts / Reb / Ast / Stl / Blk / Fantasy Total

**Given** I am viewing a game's stat breakdown
**When** I look at each stat column
**Then** the participant with the highest value in each category (Pts, Reb, Ast, Stl, Blk, Fantasy Total) is highlighted in orange-500 bold

**Given** a participant had a Mozgov replacement in that game
**When** the stat breakdown is shown
**Then** the replacement player's stats are displayed (not the original voided player's)
**And** the pick is labeled "(Mozgov)"

---

### Story 6.3: Burned Player Visibility

As a participant,
I want to see which players every participant has already used in this series,
So that I can plan my upcoming picks with full information about what's been burned across the league.

**Acceptance Criteria:**

**Given** I am viewing the standings or history pages
**When** I look at a participant's prior game picks
**Then** I can see all players they have used (burned) across every prior game in the series

**Given** I am planning my next pick
**When** I view the burned player information
**Then** I can see my own burned players clearly — the players I personally can no longer use this series
**And** I can see other participants' burned players to anticipate their likely upcoming picks

---

### Story 6.4: Automatic Post-Game Stat Corrections

As a participant,
I want official stat corrections to propagate automatically to my fantasy totals and standings,
So that the leaderboard is always accurate without anyone doing manual recalculations.

**Acceptance Criteria:**

**Given** a game has ended
**When** the `stats.correct` pg-boss job polls stats.nba.com for the completed game every 10 minutes for 24 hours after final buzzer
**Then** if any player stat differs from the previously stored value, the correction is applied to the database
**And** the original stat values are preserved in the box score record alongside the corrected values (for audit purposes — original is never overwritten, correction is stored as a separate field)

**Given** a correction is detected and stored
**When** recalculation runs
**Then** fantasy points are recomputed using `scoring.ts` against the corrected stats
**And** cumulative series standings are updated
**And** if the corrected standings change the draft order for the next game, draft order is recalculated too

**Given** a stat correction changes the cumulative series standings
**When** the recalculation completes
**Then** the draft order for the next game is also recalculated to reflect the corrected standings

**Given** a stat correction occurs
**When** the propagation completes
**Then** it finishes before the next game's draft window opens (9am PST)
**And** no commissioner action is required at any point in this process

**Given** the correction affects a game with a Mozgov replacement
**When** recalculation runs
**Then** the correction is applied to the replacement player's stats (not the voided original)
