---
stepsCompleted: ["step-01-document-discovery", "step-02-prd-analysis", "step-03-epic-coverage-validation", "step-04-ux-alignment", "step-05-epic-quality-review", "step-06-final-assessment"]
documentsIncluded:
  prd: "prd.md"
  architecture: "architecture.md"
  epics: "epics.md"
  ux: "ux-design-specification.md"
---

# Implementation Readiness Assessment Report

**Date:** 2026-03-07
**Project:** fantasy-finals

---

## PRD Analysis

### Functional Requirements

**League & User Management**

- FR1: Commissioner can create a league scoped to a specific NBA playoff series
- FR2: Commissioner can generate and share invite links for a league
- FR3: Commissioner can delegate the commissioner role for a league to another participant
- FR4: Commissioner can create and manage multiple independent leagues
- FR5: Admin can view and take action on all leagues across the platform
- FR6: Participant can join a league using an invite link
- FR7: System restricts league access to invited participants only

**Player Eligibility**

- FR8: System enforces player eligibility rules: (a) active for tonight's game (on game roster, not injured; DNP due to injury does not count as active), (b) not previously used by this participant in the current series (per-person exclusivity), (c) not double-drafted in the same game

**Draft Management**

- FR9: System generates draft order randomly for Game 1 and by inverse cumulative series standings for subsequent games. Tie-breaker: participant with higher draft pick number in that game (picked later) earns earlier pick next game
- FR10: System publishes draft order ~30 min after final game scores confirmed; draft window opens automatically at 9am PST the morning following previous game; preference lists may be set after draft order published (before 9am); sequential selection clocks begin at window open; draft closes at tip-off
- FR11: Participant can browse a personalized eligible player list during their draft turn; previously-used players shown as dimmed/non-selectable (not hidden); players used by others remain available
- FR12: Participant can submit a pick during their draft turn
- FR13: System enforces a per-pick selection clock of up to 1 hour
- FR14: System auto-assigns a pick on clock expiry using participant's preference list if available, or a random eligible player otherwise
- FR15: System labels auto-assigned picks as `auto — preference list` or `auto — system`
- FR16: Draft feed displays all picks in real time as they are submitted

**Preference List**

- FR17: Participant can create and maintain a ranked preference list before their draft turn
- FR18: System persists the preference list game-to-game, removing ineligible players at execution time
- FR19: Preference list accessible only to the individual participant — commissioner and admin cannot view any participant's list

**Pick Confirmation & Commissioner Controls**

- FR20: System requires explicit pick confirmation before finalizing any pick
- FR21: Commissioner can override any participant's submitted pick

**Mozgov Rule**

- FR22: System detects when a drafted player is active for the game but has played fewer than 5 minutes at halftime; inactive/injured (DNP) players do not trigger the rule
- FR23: System notifies all affected participants simultaneously and opens replacement window at halftime; multiple simultaneous triggers resolved in draft-order sequence (lowest pick number first); each triggered participant has a sequential 3-minute clock; hard deadline is second-half tip-off; clock expiry triggers auto-assign via preference list logic (FR14)
- FR24: Participant can select a replacement player from a filtered eligible list during replacement window; Mozgov replacement eligibility: (a) active for tonight's game, (b) played 5+ minutes in most recent active game (not necessarily prior game by number), (c) not already used by this participant this series
- FR25: System voids original player's fantasy points entirely and credits replacement player with full-game fantasy points (both halves, all scoring categories)

**Live Scoring**

- FR26: System retrieves box score data from a third-party NBA stats provider at end of each quarter (Q1, Q2/halftime, Q3, final buzzer); MVP cadence is quarterly; real-time polling is Phase 2
- FR27: System calculates fantasy points: 1×PTS + 2×REB + 2×AST + 3×STL + 3×BLK
- FR28: Participant can view their player's current fantasy point total updated at end of each quarter; standings display "LIVE · Q[n]" during active games and "FINAL" after buzzer

**Post-Game Corrections**

- FR29: System applies post-game official stat corrections automatically to fantasy point totals
- FR30: System recalculates standings and draft order when stat corrections affect previously computed values
- FR31: System ensures stat correction propagation completes before the next draft window opens

**Standings & Results**

- FR32: System maintains a series leaderboard showing cumulative fantasy points per participant
- FR33: System displays the per-game winner and full stat breakdown after each game: Pts / Reb / Ast / Stl / Blk / Fantasy Total per participant's player
- FR34: System highlights the per-game leader in each scoring category; each participant's burned player list (players used in prior games) is visible to all league participants
- FR45: System displays the draft pick order number alongside each pick in the draft feed and game history (e.g., "Jake picked Shai · pick #1")

**Notifications**

- FR35: System sends push notification when draft order is published (~30 min after final scores) and a second when draft window opens at 9am PST; draft open notification includes direct link to set/review preference list
- FR36: System sends push notification when it is a participant's turn to pick, deep-linking to pick screen
- FR37: System sends pick reminder push notification when fewer than 10 minutes remain on a participant's selection clock
- FR38: System sends push notification to affected participant when Mozgov Rule is triggered
- FR39: System sends push notification when game results and updated standings are posted
- FR40: System delivers all push notifications via FCM-backed web push without requiring a native app

**User Access & Authentication**

- FR41: Users can register and authenticate to access the platform (auth method TBD: magic link / passwordless email or OAuth via Google/Apple; email+password is fallback)
- FR42: System enforces role-based access control with distinct permissions for participant, commissioner, and admin roles
- FR43: Preference list read access restricted to individual participant at API layer, regardless of role
- FR44: Participant can view the complete draft history for the current series, including all picks made in prior games

**Total FRs: 45** (FR1–FR44 + FR45)

---

### Non-Functional Requirements

**Performance**

- NFR-PERF-1: Time to Interactive (TTI): < 3s on 4G
- NFR-PERF-2: First Contentful Paint (FCP): < 1.5s
- NFR-PERF-3: Draft feed pick updates: < 3s from submission to visible to all participants
- NFR-PERF-4: Live score updates: < 60s from official NBA stat publication
- NFR-PERF-5: Mozgov Rule push notification: < 30s from halftime detection
- NFR-PERF-6: Mozgov replacement window load: < 2s from app open

**Availability**

- NFR-AVAIL-1: 99.5% uptime required during draft windows (day-before open through tip-off) and Mozgov halftime windows (~15 min per game)
- NFR-AVAIL-2: Outside critical windows: best-effort; no SLA required
- NFR-AVAIL-3: No deployments during active draft or game windows

**Security**

- NFR-SEC-1: HTTPS for all traffic
- NFR-SEC-2: Authentication required for all app routes
- NFR-SEC-3: RBAC enforced at API layer — UI-level restrictions insufficient
- NFR-SEC-4: Preference list data never returned to commissioner or admin roles via API, regardless of request parameters
- NFR-SEC-5: No PCI-DSS, HIPAA, or GDPR obligations beyond basic user account data handling

**Integration**

- NFR-INT-1: NBA stats API must provide intra-game updates with player minutes available at halftime (not post-game only), post-game correction events, uptime during playoff windows, appropriate licensing; provider selection is a pre-development gate
- NFR-INT-2: FCM web push for all notification types; no native app required; latency must meet performance targets

**Scalability**

- NFR-SCALE-1: Scale: tens to low hundreds of total users across all leagues
- NFR-SCALE-2: Traffic pattern bursty during draft and game windows, low otherwise
- NFR-SCALE-3: Concurrent draft activity must not produce race conditions on pick assignment or eligibility state

**Accessibility**

- NFR-A11Y-1: Semantic HTML for all core flows
- NFR-A11Y-2: Keyboard navigability for pick submission, draft feed, and standings
- NFR-A11Y-3: Sufficient color contrast for mobile and desktop readability
- NFR-A11Y-4: WCAG AA not required; reasonable baseline is the target

**Total NFRs: 20**

---

### Additional Requirements

- Platform: PWA-capable SPA, mobile-first; no native app planned; framework TBD in architecture phase
- Browser support: Chrome, Safari, Firefox (latest 2 each); no legacy browser support
- Responsive design: all core flows (pick submission, draft feed, standings, Mozgov window) fully usable on mobile; PWA installability supported
- SEO: not applicable (invite-only, auth-gated)
- Real-time draft feed and live scoring via polling (< 3s draft, < 60s scores); WebSocket optional for MVP
- PWA manifest and service worker for installability
- No payment processing on-platform; prizes managed externally by commissioner
- Invite-only access; no public leagues
- Pre-development gate: stats API provider must be selected and evaluated before development begins; fallback: manual commissioner-triggered Mozgov window

### PRD Completeness Assessment

The PRD is well-structured and comprehensive. Requirements are numbered and clearly scoped. The document:
- Clearly separates MVP from Phase 2/3 features
- Provides specific timing, thresholds, and rules for edge cases (Mozgov, tie-breaking, auto-assign)
- Includes user journeys that cross-validate capabilities
- Documents known risks and mitigation strategies
- Has one numbering gap noted: FR45 appears after FR44 but covers standings/draft history display — not a coverage gap, just a late-added requirement

**Overall PRD Completeness: HIGH — suitable for architecture and epic validation.**

---

## Epic Coverage Validation

### Coverage Matrix

| FR | PRD Requirement (summary) | Epic Coverage | Status |
|---|---|---|---|
| FR1 | Commissioner creates league scoped to NBA playoff series | Epic 2 → Story 2.1 | ✓ Covered |
| FR2 | Commissioner generates and shares invite links | Epic 2 → Story 2.2 | ✓ Covered |
| FR3 | Commissioner delegates commissioner role | Epic 2 → Story 2.4 | ✓ Covered |
| FR4 | Commissioner manages multiple independent leagues | Epic 2 → Story 2.5 | ✓ Covered |
| FR5 | Admin views and acts on all leagues | Epic 2 → Story 2.6 | ✓ Covered |
| FR6 | Participant joins league via invite link | Epic 2 → Story 2.3 | ✓ Covered |
| FR7 | System restricts access to invited participants only | Epic 2 → Story 2.3 | ✓ Covered |
| FR8 | Player eligibility enforcement (active, per-person, no double-draft) | Epic 3 → Story 3.5 | ✓ Covered |
| FR9 | Draft order: random Game 1, inverse standings, tie-breaker | Epic 3 → Story 3.3 | ✓ Covered |
| FR10 | Draft order publish timing, 9am PST window, sequential clocks | Epic 3 → Story 3.4 | ✓ Covered |
| FR11 | Personalized eligible player list (used = dimmed, not hidden) | Epic 3 → Story 3.5 | ✓ Covered |
| FR12 | Participant submits pick | Epic 3 → Story 3.6 | ✓ Covered |
| FR13 | Per-pick selection clock up to 1 hour | Epic 3 → Story 3.4 | ✓ Covered |
| FR14 | Auto-assign on clock expiry (preference list or system random) | Epic 3 → Story 3.9 | ✓ Covered |
| FR15 | Auto-assign labels: `auto — preference list` / `auto — system` | Epic 3 → Story 3.9 | ✓ Covered |
| FR16 | Real-time draft feed | Epic 3 → Story 3.7 | ✓ Covered |
| FR17 | Ranked preference list creation & management | Epic 3 → Story 3.8 | ✓ Covered |
| FR18 | Preference list persists game-to-game, eligibility filtered at execution | Epic 3 → Story 3.8 | ✓ Covered |
| FR19 | Preference list private to participant (API-enforced) | Epic 3 → Story 3.8 | ✓ Covered |
| FR20 | Explicit pick confirmation before finalizing | Epic 3 → Story 3.6 | ✓ Covered |
| FR21 | Commissioner pick override | Epic 3 → Story 3.10 | ✓ Covered |
| FR22 | Halftime detection: active player < 5 minutes triggers Mozgov | Epic 5 → Story 5.1 | ✓ Covered |
| FR23 | Replacement window: simultaneous notify, sequential 3-min clock, tip-off deadline | Epic 5 → Story 5.2 | ✓ Covered |
| FR24 | Replacement player eligibility (active, 5+ min recent game, not used) | Epic 5 → Story 5.3 | ✓ Covered |
| FR25 | Original voided; replacement earns full-game fantasy credit | Epic 5 → Story 5.4 | ✓ Covered |
| FR26 | Quarterly box score retrieval (Q1, halftime, Q3, final) | Epic 4 → Story 4.1 | ✓ Covered |
| FR27 | Fantasy scoring: 1×PTS + 2×REB + 2×AST + 3×STL + 3×BLK | Epic 3 → Story 3.2 | ✓ Covered |
| FR28 | Live score display with LIVE · Q[n] and FINAL indicators | Epic 4 → Story 4.1 | ✓ Covered |
| FR29 | Post-game stat corrections applied automatically | Epic 6 → Story 6.4 | ✓ Covered |
| FR30 | Standings & draft order recalculated on correction | Epic 6 → Story 6.4 | ✓ Covered |
| FR31 | Correction propagation completes before next draft window | Epic 6 → Story 6.4 | ✓ Covered |
| FR32 | Series leaderboard with cumulative fantasy points | Epic 6 → Story 6.1 | ✓ Covered |
| FR33 | Per-game stat breakdown (Pts/Reb/Ast/Stl/Blk/Fantasy Total) | Epic 6 → Story 6.2 | ✓ Covered |
| FR34 | Per-category leaders highlighted; burned player list visible | Epic 6 → Stories 6.2, 6.3 | ✓ Covered |
| FR35 | Push notification: draft order published + window opens (pref list CTA) | Epic 3 → Story 3.11 | ✓ Covered |
| FR36 | Push notification: your turn, deep-link to pick screen | Epic 3 → Story 3.11 | ✓ Covered |
| FR37 | Push notification: pick reminder at < 10 min on clock | Epic 3 → Story 3.11 | ✓ Covered |
| FR38 | Push notification: Mozgov Rule triggered | Epic 5 → Story 5.2 | ✓ Covered |
| FR39 | Push notification: game results & standings posted | Epic 4 → Story 4.2 | ✓ Covered |
| FR40 | FCM web push infrastructure | Epic 1 → Story 1.5 | ✓ Covered |
| FR41 | User registration & authentication | Epic 1 → Story 1.2 | ✓ Covered |
| FR42 | RBAC: participant, commissioner, admin roles | Epic 1 → Story 1.3 | ✓ Covered |
| FR43 | Preference list API-layer privacy guard | Epic 1 → Story 1.3 | ✓ Covered |
| FR44 | Series-long draft history view | Epic 3 → Story 3.12 | ✓ Covered |
| FR45 | Draft pick order number displayed in feed and history | Epic 3 → Story 3.12 | ✓ Covered |

### Missing Requirements

**None.** All 45 FRs are covered.

### Coverage Statistics

- Total PRD FRs: 45
- FRs covered in epics: 45
- Coverage percentage: **100%**

### Epic Distribution Summary

| Epic | Title | FRs Covered |
|---|---|---|
| Epic 1 | Platform Foundation — App Shell, Auth & Infrastructure | FR40, FR41, FR42, FR43 (4 FRs) |
| Epic 2 | League Management & Invitations | FR1–FR7 (7 FRs) |
| Epic 3 | The Draft — Player Selection & Automated Flow | FR8–FR21, FR35–FR37, FR44–FR45 (19 FRs) |
| Epic 4 | Live Game Scoring & Results Notification | FR26–FR28, FR39 (4 FRs) |
| Epic 5 | The Mozgov Rule — Halftime Replacement Window | FR22–FR25, FR38 (5 FRs) |
| Epic 6 | Standings, Category Leaders & Post-Game Corrections | FR29–FR34 (6 FRs) |

---

## UX Alignment Assessment

### UX Document Status

**Found:** `ux-design-specification.md` (66,694 bytes, Mar 7 14:57)

### Screens & Views Defined in UX

1. Landing & Auth (invite link handler)
2. Registration / Sign-in (magic link or OAuth)
3. Dashboard (my leagues overview)
4. League Home (current game status, next draft info, preference list CTA)
5. Draft Screen (eligible player list, selection clock, stat expand)
6. Pick Confirmation Dialog (modal)
7. Preference List Screen (drag-to-reorder, bottom sheet on mobile)
8. Preference List Success Banner ("Autopilot set")
9. Draft Feed (real-time pick feed with auto-assign badges)
10. ActiveStateBar (persistent bottom widget for clock or Mozgov state)
11. Mozgov Replacement Window (red-themed, countdown, eligibility filter)
12. Standings Screen (leaderboard + per-game stat grid, category leaders)
13. Game Results Screen (per-game winner, category leaders)
14. Draft History (series-long view)
15. League Settings (commissioner controls)
16. Admin Cross-League View
17. Success Banners, Snackbar/Undo Flow (5-second undo on consequential actions)
18. Invite Link Landing
19. Player Detail Expand (stat breakdown in draft list row)

### Alignment Issues

#### HIGH PRIORITY

**1. Mozgov Real-Time Latency — Pre-Development Blocker**
- UX assumes Mozgov detection is seamless with < 30s notification latency
- Architecture flags NBA stats API halftime data as a pre-development gate (must support intra-game player minutes at halftime)
- If the stats API cannot deliver halftime data in time, Mozgov latency targets are at risk
- **Action Required:** Validate NBA stats API halftime data capability BEFORE development begins (already identified as blocker in PRD and architecture)

**2. Polling vs. Real-Time Perception Mismatch**
- UX narrative describes the draft feed as the "heartbeat" of each game: "picks appear as they happen," "opens and updates automatically; nothing to trigger or refresh manually"
- Architecture specifies 3-second polling for the draft feed (MVP-acceptable); WebSocket deferred to post-MVP
- UX language oversells seamlessness for a polling implementation
- **Action Required:** Confirm 3-second polling latency is acceptable; adjust UX copy if needed (e.g., "picks appear within seconds" vs. "as they happen")

#### MEDIUM PRIORITY

**3. Missing UI for Stat Correction Input**
- Architecture assigns stat correction processing to `standing.ts` router / `stats-correct.ts` worker
- UX mentions commissioner override actions are "2 taps max" and shows asterisk/tooltip on corrected stats in standings
- No screen or flow is designed for how a commissioner enters/requests a stat correction
- **Action Required:** Design the stat correction input UI (modal or commissioner panel entry point) before Epic 6 development

**4. Missing Dependencies Not Listed in Architecture**
- UX specifies drag-to-reorder preference list (requires `dnd-kit` or `react-beautiful-dnd`)
- UX specifies undo snackbar (Sonner) throughout multiple flows
- Neither dependency is explicitly listed in the architecture T3 starter setup
- **Action Required:** Add to implementation checklist before Epic 3/preference list story development

**5. Preference List Ineligible Player Cleanup Trigger Undocumented**
- UX requires ineligible players to be "already removed silently" from the preference list before execution time
- Architecture does not document when/where this cleanup logic fires (clock-expire job? draft order publish? both?)
- **Action Required:** Document the trigger point in worker job design before Epic 3 implementation

#### LOW PRIORITY

**6. NBA Player Activity/Injury Status API Validation**
- UX eligibility rules require "active = on game roster, not injured; DNP does not count as active"
- Mozgov replacement requires "played 5+ mins in most recent game they were active"
- Architecture already flags this as an implementation risk (line 602)
- **Action Required:** Part of pre-development NBA API evaluation (already tracked)

### Warnings

- **None blocking.** UX document is comprehensive and covers all required screens and flows
- **Pre-development gate** remains the NBA stats API validation (shared concern across PRD, architecture, and UX)
- The **stat correction input UI gap** is the only screen explicitly missing from the UX design; it is a low-frequency commissioner action but must be designed before Epic 6

### UX ↔ PRD Coverage Assessment

All 45 FRs have corresponding UX screen or flow designs. No FRs are unaddressed in the UX specification.

### UX ↔ Architecture Alignment Score

| Dimension | Score | Notes |
|---|---|---|
| Tech Stack Compatibility | 9/10 | React/Next.js/Radix/Tailwind is correct; minor missing deps (dnd-kit, Sonner) |
| Feature Coverage | 9/10 | All FRs covered; stat correction input UI gap is minor |
| Real-Time Expectations | 6/10 | 3s polling acceptable but UX copy oversells seamlessness |
| Platform & Accessibility | 10/10 | Both docs thorough; PWA, keyboard nav, mobile-first all aligned |
| Responsiveness | 10/10 | Mobile-first, 640px max-width, bottom nav — fully aligned |

**Overall UX Alignment: MEDIUM** — Directionally strong; three actionable gaps to resolve before or during development.





---

## Epic Quality Review

### Epic Structure Assessment

| Epic | User Value Focus | Independence | Verdict |
|---|---|---|---|
| Epic 1: Platform Foundation — App Shell, Auth & Infrastructure | PASS (with concern) | PASS | See story-level issues below |
| Epic 2: League Management & Invitations | PASS | PASS | Clean |
| Epic 3: The Draft — Player Selection & Automated Flow | PASS | PASS | See story-level issues below |
| Epic 4: Live Game Scoring & Results Notification | PASS | PASS | See story-level issues below |
| Epic 5: The Mozgov Rule — Halftime Replacement Window | PASS | PASS | See story-level issues below |
| Epic 6: Standings, Category Leaders & Post-Game Corrections | PASS | PASS | See story-level issues below |

**No forward dependencies found between epics.** Epic sequencing (1→2→3→4→5→6) is sound.

---

### Story-Level Violations

#### 🔴 CRITICAL

**Story 1.6 — Background Job Worker**
- **Violation:** "As the system" is not a user persona. This story has zero user-facing value — it is a pure infrastructure task.
- **Impact:** Violates fundamental user story rules; should be restructured as implementation tasks inside a technically-framed story (e.g., folded into Story 1.1 scaffolding tasks or treated as a dev task, not a story)
- **Recommendation:** Either remove as a standalone story and fold worker setup into 1.1 implementation tasks, or reframe as user value: "As a commissioner, I want picks and draft timers to run automatically so I don't have to manually manage them" — with background worker as the implementation vehicle

**Story 3.1 — NBA Stats API Integration**
- **Violation:** "As the system" persona; purely technical abstraction story with no user-facing value
- **Impact:** Violates user story rules. Service abstraction is an implementation detail, not a deliverable
- **Recommendation:** Reframe to user value: "As a participant, I want live game stats available in the app so I can track my player's performance" — with the stats API integration as the implementation vehicle. The story should verify user-observable outcomes (e.g., "I see current quarter stats for an active game") not just service availability

---

#### 🟠 MAJOR

**Story 3.4 — Draft Window & Selection Clock**
- **Issue:** Draft order publication timing uses "approximately 30 minutes" — not measurable/testable
- **Recommendation:** Specify exact window: "within 30 minutes of final score confirmation" and add AC for what happens if the publication job fails at scheduled time

**Story 3.8 — Preference List Management**
- **Issue (Critical Detail):** AC does not specify WHEN ineligible player cleanup fires — at draft order publication (~30 min post-game)? At 9am draft window open? Continuously? This is a critical timing edge case
- **Issue:** No AC for what happens when a participant adds a player to their list who has already been used (burned)
- **Recommendation:** Explicitly state cleanup trigger: "When draft order is published (30 min post-game), ineligible players are removed from all affected preference lists before any participant is notified"

**Story 3.9 — Auto-Assign on Clock Expiry**
- **Issue:** No AC for when all eligible players are exhausted (all burned by this participant or used in current game)
- **Recommendation:** Add explicit AC: "Given all eligible players are exhausted when clock expires, Then [defined behavior — system generates an error, commissioner is notified, or participant receives a forfeit]"

**Story 3.10 — Commissioner Pick Override**
- **Issue:** "Within 2 taps from game context" is not testable as written; no explicit UI entry point defined
- **Recommendation:** Define the exact navigation path: e.g., "League Home > Game Card > Pick Card > Long-press > Override Option" so QA can verify

**Story 4.1 — Quarterly Score Updates**
- **Issue:** Contradictory update model: story title says "quarterly" (job-driven at Q1/Q2/Q3/final) but AC says "standings display updates within 60 seconds" implying continuous polling. Which is canonical?
- **Recommendation:** Explicitly separate: the system polls the NBA stats API every N seconds during active game windows and displays updates as they arrive; the "quarterly" refers to the cadence at which the NBA API publishes new stats (not how often the app polls). Clarify this in the AC.

**Story 4.1 — Missing Job Specification**
- **Issue:** No pg-boss job named or defined for triggering quarterly score fetches
- **Recommendation:** Name the job (e.g., `scores.poll`) and specify its schedule/trigger condition

**Story 5.1 — Halftime Detection**
- **Issue:** AC doesn't specify exactly when the `halftime.check` job fires relative to halftime (at halftime detection? 5 minutes before? polling continuously?)
- **Issue:** References a `MozgovWindow` Prisma model that is not verified to exist in the schema at this story's implementation point
- **Recommendation:** Specify job polling cadence during the pre-halftime window; confirm schema model is created in this story

**Story 5.2 — Mozgov Replacement Window & Sequential Clock**
- **Issue:** "Draft pick number" used to determine sequential Mozgov order is ambiguous — is this the pick number from the current game (Game N) or from Game 1? This affects fairness of the mechanic
- **Recommendation:** Clarify with explicit example: "Given participants picked in order A=pick#1, B=pick#2, C=pick#3 in Game 3, and both A and C trigger Mozgov, Then A selects first (lowest pick# in Game 3), C selects second"

**Story 5.3 — Mozgov Replacement Eligibility**
- **Issue:** "Played 5+ minutes in most recent game they were active" is complex; no example AC provided for multi-game injury absence scenario
- **Recommendation:** Add explicit scenario AC: "Given Player X played 6 min in Game 1, missed Game 2 due to injury, and halftime check fires in Game 3, Then the system evaluates Game 1 stats (most recent active game) and Player X appears eligible in the replacement list"

**Story 6.4 — Automatic Post-Game Stat Corrections**
- **Issue:** No mechanism specified for how the system detects stat corrections have occurred (does the NBA stats API push correction events? does the system poll for changes? is it commissioner-triggered?)
- **Issue:** No data model design for storing corrected stats vs. original stats (audit trail, correction history)
- **Recommendation:** Define the correction detection mechanism (polling interval or webhook); clarify whether original stats are overwritten or preserved alongside corrections

---

#### 🟡 MINOR

**Story 1.2 — User Authentication**
- Missing AC for magic link expiry duration (what is the link timeout?)
- No AC for disambiguation between sign-in and registration when email doesn't exist

**Story 1.4 — App Shell, Design System & PWA**
- PWA install condition AC vague ("when install conditions are met" without specifying conditions)

**Story 1.5 — FCM Web Push Infrastructure**
- Missing failure-mode ACs for invalid push subscription, FCM quota exceeded, or FCM API unavailability

**Story 2.1 — Create a League**
- No AC for default selection clock value when commissioner doesn't set one

**Story 2.3 — Join a League via Invite Link**
- No AC for mid-series join behavior (can a participant join when draft window is open or game is live?)

**Story 3.3 — Draft Order Generation**
- Tie-breaker rule from FR9 is not explicitly in the story's AC

**Story 3.5 — Eligible Player List**
- "Series avg" is ambiguous — should clarify "average fantasy points per game in the current series so far"

**Story 3.12 — Series Draft History**
- "Burned player" definition should clarify: are Mozgov-voided original picks shown as burned or not?

**Story 5.4 — Replacement Scoring**
- No AC for edge case where replacement player is injured and does not play the second half

---

### Dependency Analysis

**Within-Epic Dependencies:** All stories appear to progress logically within each epic. No forward dependencies within epics were identified (each story builds on prior stories in sequence).

**Database/Schema Concern:** The epics document does not explicitly define when each Prisma model is first created. The pattern should be "each story creates the tables it needs." Key models to verify:
- `MozgovWindow` — should be created in Story 5.1 if not already present
- Stat correction audit model — should be created in Story 6.4
- Ensure no story in later epics assumes a model exists that wasn't explicitly created in an earlier story

---

### Best Practices Compliance Checklist

| Epic | Delivers User Value | Independent | Stories Sized | No Forward Deps | AC Testable | FR Traceability |
|---|---|---|---|---|---|---|
| Epic 1 | ⚠️ Partial | ✅ | ⚠️ Stories 1.1 & 1.6 | ✅ | ⚠️ Minor gaps | ✅ |
| Epic 2 | ✅ | ✅ | ✅ | ✅ | ⚠️ Minor gaps | ✅ |
| Epic 3 | ✅ | ✅ | ⚠️ Story 3.1 | ✅ | ⚠️ Major gaps (3.4, 3.8, 3.9, 3.10) | ✅ |
| Epic 4 | ✅ | ✅ | ✅ | ✅ | ⚠️ Major gap (4.1 contradiction) | ✅ |
| Epic 5 | ✅ | ✅ | ✅ | ✅ | ⚠️ Major gaps (5.1, 5.2, 5.3) | ✅ |
| Epic 6 | ✅ | ✅ | ✅ | ✅ | ⚠️ Major gap (6.4) | ✅ |

### Quality Summary

| Severity | Count |
|---|---|
| 🔴 Critical | 2 |
| 🟠 Major | 12 |
| 🟡 Minor | 9 |
| **Total** | **23** |

**Overall Epic Quality: MODERATE.** The epic architecture is sound with correct sequencing, 100% FR coverage, and no forward dependencies. The issues identified are primarily story-level AC gaps and two structural story violations (1.6 and 3.1). These do not block development but should be addressed before development begins on the affected stories.

---

## Summary and Recommendations

### Overall Readiness Status

## ⚠️ NEEDS WORK

The project is **close to ready** but has specific issues that must be resolved before implementation begins. The planning artifacts are comprehensive and well-aligned in structure, but the two critical story violations and several timing/AC gaps should be addressed to prevent ambiguity during development.

---

### Findings Summary

| Assessment Area | Result | Issues Found |
|---|---|---|
| Document Discovery | ✅ PASS | All 4 artifacts present, no duplicates |
| PRD Completeness | ✅ HIGH | 45 FRs + 20 NFRs, well-structured |
| Epic FR Coverage | ✅ 100% | All 45 FRs covered across 6 epics |
| UX Alignment | ⚠️ MEDIUM | 3 actionable gaps (stat correction UI, polling perception, deps) |
| Epic Quality | ⚠️ MODERATE | 2 Critical, 12 Major, 9 Minor story-level issues |

**Total Issues: 26** (2 critical, 15 major, 9 minor)

---

### Critical Issues Requiring Immediate Action

**1. Story 1.6 "Background Job Worker" — Not a user story**
- "As the system" violates user story rules; zero user-facing value
- **Action:** Fold worker scaffold into Story 1.1 implementation tasks OR reframe with user persona: "As a commissioner, I want picks and draft timers to execute automatically so I never have to manually run the draft"

**2. Story 3.1 "NBA Stats API Integration" — Not a user story**
- "As the system" with purely technical abstraction ACs; no user-observable outcome
- **Action:** Reframe as: "As a participant, I want live game stats in the app so I can track my player's performance" with ACs verifying user-visible stat data (not just service abstraction)

**3. Pre-Development Blocker: NBA Stats API Validation (carried from PRD and Architecture)**
- Both the Mozgov Rule (FR22-FR25) and live scoring (FR26, FR28) depend on the NBA stats provider supporting intra-game player minutes at halftime
- This is explicitly flagged in the PRD, architecture, and now UX as a gate that must be resolved BEFORE development begins
- **Action:** Evaluate BallDontLie, Sportradar, SportsData.io, or NBA Stats API for halftime player minute availability; select provider; configure NBA stats client before Story 3.1 can be implemented

---

### Recommended Next Steps

**Before Epic 1 Development Starts:**

1. **Resolve Stories 1.6 and 3.1** — restructure with user personas and user-observable acceptance criteria
2. **Select NBA Stats API provider** — evaluate and confirm halftime player minute data availability (pre-development gate); document selected provider in architecture
3. **Add missing dependencies to implementation checklist** — `dnd-kit` (preference list drag-to-reorder) and confirm Sonner is available via shadcn/ui in the T3 baseline

**Before Epic 3 Development Starts:**

4. **Story 3.4:** Replace "approximately 30 minutes" with a measurable, testable timing specification
5. **Story 3.8:** Define the exact trigger point for preference list ineligible-player cleanup (recommendation: at draft order publication, before notifications fire)
6. **Story 3.9:** Define system behavior when all eligible players are exhausted at clock expiry
7. **Story 3.10:** Define the exact UI navigation path for commissioner pick override (not just "2 taps")

**Before Epic 4 Development Starts:**

8. **Story 4.1:** Resolve the contradiction between "quarterly updates" (job-driven) and "< 60s display refresh" (polling-driven); clarify which mechanism is canonical and name the pg-boss job

**Before Epic 5 Development Starts:**

9. **Story 5.1:** Specify exact `halftime.check` job polling cadence and confirm `MozgovWindow` Prisma model is created in this story
10. **Story 5.2:** Clarify that "draft pick number" for Mozgov sequential order refers to the current game's draft order (Game N pick positions), not Game 1 positions

**Before Epic 6 Development Starts:**

11. **Story 6.4:** Define the stat correction detection mechanism (polling vs. webhook vs. commissioner-triggered); clarify data model for storing original vs. corrected stats
12. **Design stat correction input UI** — no screen currently exists in the UX spec for how a commissioner enters a correction; this must be designed before Epic 6 development

---

### Positive Findings

- **PRD is excellent.** 45 FRs are well-numbered, clearly scoped, and include specific timing, thresholds, and edge case rules. The Mozgov Rule is defined in exceptional detail.
- **FR coverage is 100%.** Every requirement has a traceable path from PRD → Epic → Story. No requirements fell through the cracks.
- **Epic architecture is sound.** Six epics with correct sequencing, no forward dependencies, and clear user value for Epics 2–6.
- **UX specification is comprehensive.** All 19 screens/views are designed; the design language is cohesive; accessibility and mobile-first requirements are thorough.
- **Tech stack alignment is strong.** Next.js 15 + T3 + Prisma + shadcn/ui + Railway + FCM is well-matched to the project's needs.

---

### Final Note

This assessment identified **26 issues** across 5 categories. The two critical issues (Stories 1.6 and 3.1) and the pre-development NBA API blocker should be resolved before Sprint 1 begins. The major AC gaps should be resolved before the relevant story is picked up for development. The minor issues can be addressed at implementation time.

The planning artifacts are overall at **high maturity** — addressing the identified items will bring this project to full implementation readiness.

**Report generated:** `_bmad-output/planning-artifacts/implementation-readiness-report-2026-03-07.md`
**Assessor:** BMM Implementation Readiness Workflow
**Date:** 2026-03-07
