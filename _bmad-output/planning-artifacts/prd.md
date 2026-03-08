---
stepsCompleted: [step-01-init, step-02-discovery, step-02b-vision, step-02c-executive-summary, step-03-success, step-04-journeys, step-01b-continue, step-05-domain, step-06-innovation, step-07-project-type, step-08-scoping, step-09-functional, step-10-nonfunctional, step-11-polish, step-12-complete]
classification:
  projectType: web_app
  domain: sports_entertainment
  complexity: medium
  projectContext: greenfield
  userScale: small_social_invite_only
  mvpScope: any_nba_playoff_series
  v2Scope: single_game_mode
inputDocuments: ['game-spec-v0 (provided inline by user)']
briefCount: 0
researchCount: 0
brainstormingCount: 0
projectDocsCount: 1
workflowType: 'prd'
---

# Product Requirements Document - fantasy-finals

**Author:** Todd
**Date:** 2026-03-05

## Executive Summary

NBA Fantasy Finals is a lightweight, series-based fantasy sports platform for small, invite-only friend groups. It replaces informal coordination (group texts, manual spreadsheets) that casual NBA fans use to stay engaged with playoff basketball. Users make one player pick per game, earn fantasy points from live box scores, and compete across the series for bragging rights and a commissioner-set prize. Built for busy adults who want genuine engagement with every playoff game — not a season-long roster management commitment.

**Platform:** Web app (PWA-capable, mobile-first) — Greenfield — Medium complexity
**User scale:** Small social, invite-only friend groups — multi-league from day one
**MVP target:** Any NBA playoff series; V2 adds single-game mode

### What Makes This Special

Existing fantasy platforms (ESPN, Yahoo) demand season-long attention and roster expertise. NBA Fantasy Finals inverts that model: one pick, one game, zero management overhead. Three design decisions separate it from everything else:

- **The Mozgov Rule** — a halftime replacement window triggered when a drafted player logs fewer than 5 minutes, converting a passive frustration into a time-pressured, high-stakes decision
- **Inverted draft order** — worst cumulative series score picks first each game, keeping every participant competitive regardless of series standing
- **Deliberate minimalism** — a protected design constraint, not MVP scope; future features must reduce coordination cost, not add it

## Success Criteria

### User Success

- Every participant places a pick in every game without commissioner follow-up; automated notifications drive all pick reminders
- Eligibility is surfaced clearly at pick time with no ambiguity
- Pick confirmation prevents accidental selections; commissioner override provides a last-resort correction path
- Participants submit a pre-draft preference list; on clock expiry the system auto-selects the first eligible player, eliminating manual intervention for known absences
- Participants track their player's fantasy points in real time during games
- Post-game stat corrections propagate automatically to standings and draft order before the next draft opens
- New users join a league and make their first pick without external help

### Business Success

- Commissioner workload: create a league, invite players, rare override actions — no manual draft running, no chasing participants
- Full participant engagement (all picks submitted before tip-off) every game in a series
- Platform is usable for any NBA playoff series, enabling real-world testing before the Finals

### Technical Success

- System is highly available during the two critical windows per game: draft window and Mozgov halftime window
- Box scores update in real time during games; post-game corrections apply automatically at any time
- Selection clock runs up to 1 hour per pick; draft order publishes ~30 min after final scores post; draft window opens at 9am PST the morning following the previous game; auto-assign fires on expiry
- Stat corrections affecting draft order applied before the next draft window opens

### Measurable Outcomes

- 100% pick submission rate per game (zero forfeits to auto-assign under normal conditions)
- Live score updates visible within 60 seconds of official NBA stat publication
- Zero commissioner-initiated draft actions (fully automated)
- Pick confirmation shown on every selection; commissioner override available for every submitted pick

## Product Scope

### MVP — Any NBA Playoff Series (Phase 1)

Full game loop end-to-end. Must be production-ready before the 2026 NBA first-round series (~6 weeks from project start). Solo developer. Stats API provider must be selected before development begins.

**Capabilities:**
- League creation, player invitations, commissioner delegation, multi-league support
- Draft order: randomized Game 1, inverse cumulative standings thereafter, with tie-breaker
- Sequential draft: selection clock (up to 1 hour), day-before open window, auto-assign on expiry
- Pre-draft preference list: persistent game-to-game, auto-filtered for eligibility, `auto — preference list` label on auto-assign
- Pick confirmation; commissioner override
- Player eligibility enforcement (active roster, not previously drafted in series, not double-drafted same game)
- Real-time box score retrieval; fantasy scoring: PTS + 2×REB + 2×AST + 3×STL + 3×BLK
- Mozgov Rule: halftime detection, replacement window, full-game fantasy credit for replacement (original player's stats voided); multiple simultaneous triggers resolved in draft-order sequence; replacement eligibility requires 5+ mins in most recent active game AND not previously used by this participant this series
- Standings: series leaderboard, per-game stat breakdown (Pts/Reb/Ast/Stl/Blk/Fantasy Total), per-game category leaders highlighted, burned player list visible to all league participants
- Notifications: draft open, your turn, pick reminder, Mozgov trigger, results posted (web push via FCM)
- Post-game stat correction with automatic standings and draft order recalculation
- Admin cross-league visibility and controls
- Role-based access: preference list private to individual, enforced at API level

**Deferred from MVP:** Emoji reactions on game results and Mozgov events

### Phase 2 — Growth

- Emoji reactions on game results and Mozgov events
- Single-game mode (no series commitment, one-off play)
- Alternate commissioner-configurable scoring systems
- Enhanced commissioner controls (extend draft timers, edit rules mid-series)
- Free-for-all Mozgov replacement mode: when multiple participants trigger Mozgov simultaneously, all select simultaneously — first tap wins; selected player removed from others' lists in real time. Configurable per league by commissioner
- Real-time score updates (30–60 second polling) during games, replacing quarterly cadence

### Phase 3 — Expansion

- Historical tracking: series champions, multi-year leaderboards, category records
- Mobile app (native iOS/Android, contingent on PWA proving the experience)
- Multi-sport expansion (NFL playoffs, etc.)
- Public leagues or cross-group competition

### Risk Mitigation

- **Halftime detection (highest risk):** The Mozgov Rule requires reliable intra-game box scores showing player minutes at halftime. Stats API must be evaluated for this capability before development begins. Fallback: manual commissioner-triggered Mozgov window.
- **Stats API during peak windows:** Provider must be evaluated for uptime SLAs and rate limits during playoff traffic.
- **Timeline:** If compressed, manual Mozgov fallback eliminates the highest-risk automated feature without breaking the game loop.

## User Journeys

### Journey 1 — Todd: The Admin Who Just Wants to Watch the Game

**Opening Scene:** It's two weeks before the playoffs. Todd's group chat already has three messages asking "are we doing Fantasy Finals this year?" He's also got a DM from Tyler: *"Hey, my other friend group wants to do this too — can I get that spreadsheet?"* Todd knows what's coming: setting up the spreadsheet, texting everyone the link, running the draft manually, chasing people down for picks every game day for two weeks. He loves the game. He dreads the logistics.

**Rising Action:** This year is different. Todd opens the app and creates a league — selects the playoff series, sets the selection clock to 45 minutes, and sends invite links. The system generates the draft order. He creates a second league for Tyler's group and hands Tyler the commissioner role. Tyler is on his own from there. Todd doesn't touch Tyler's league again.

Game 1 draft opens automatically. Todd gets a notification when it's his turn — just like everyone else. He makes his pick, confirms it. The system chases down the stragglers. One friend hasn't picked with 10 minutes left — they get a reminder notification. They pick. Draft locks at tip-off.

**Climax:** Halfway through the series, Tyler messages Todd: *"One of my players had a box score correction — the standings changed but the draft order didn't update."* Todd opens the admin panel, finds Tyler's league, triggers the draft order recalculation. Done in 30 seconds. No spreadsheet. No manual math.

**Resolution:** Finals Game 7. Todd is on his couch watching the game. His phone buzzes with a Mozgov alert for another player — not his. He grins. The standings post automatically after the game. He Venmos the winner the gift card amount and closes his laptop. That's all he had to do.

**Note:** Preference list privacy is absolute — Todd cannot view any participant's preference list, even in his admin role. His advantage is only his own preparation.

**Capabilities revealed:** League creation, multi-league support, commissioner delegation, admin oversight across leagues, draft order management, push notifications, pick confirmation, commissioner override, stat correction propagation, admin cross-league controls, role-based access (preference lists private to individual).

---

### Journey 2 — Jake: Playing Chess While Everyone Else Plays Checkers

**Opening Scene:** Jake gets the invite link. Before he even accepts, he's already thinking: *Game 1 is random draft order, but Games 2 through 7 go worst-to-first. If I can sacrifice Game 1 with a risky pick and nail Games 2 and 3, I can build a lead before anyone adjusts.* He accepts the invite and opens the eligible players list immediately.

**Rising Action:** The day before Game 1, Jake opens the app and studies the eligible players. He sets his preference list — his true picks in ranked order — as a backup strategy, not just a safety net. He plans to be available when his turn comes, but having the list means his strategy executes even if he's pulled away.

Draft opens. Jake watches the draft feed in real time as picks appear the moment each player submits. His first choice gets taken two picks before him. He smoothly pivots to his second. Picks his replacement without hesitation. Confirms.

**Climax:** Game 2. Jake drafted last (he won Game 1). He watches the scoreboard throughout the game, tracking his player's fantasy point line in real time. With two minutes left, his player hits a 3-pointer and he's up 4 points on the series leader. He refreshes standings. He's second overall. *Right where I want to be.*

**Resolution:** By Game 4, Jake has a 12-point series lead. His friends are accusing him of knowing someone at the NBA. He doesn't. He just paid attention. The standings page shows his name at the top with category leaders beneath it — he's also leading in assists per game. He screenshots it and sends it to the group chat unprompted.

**Capabilities revealed:** Eligible player browsing, real-time open draft feed, preference list as strategic tool, live score tracking, standings with category leaders, series-long draft history.

---

### Journey 3 — Mark: He Picked With His Heart and the Mozgov Rule Found Him

**Opening Scene:** Mark gets the invite. He doesn't know the players' stats. He doesn't care. He knows two things: his guy looks hot right now, and his gut has never failed him. He accepts the invite and looks forward to having a reason to watch the game tonight.

**Rising Action:** Draft opens. Mark gets a notification — it's his turn. He opens the app, sees the list of eligible players, and immediately spots a name he recognizes. He taps the player. A confirmation screen appears: *"You've selected [Player]. Confirm your pick?"* He confirms. He's done. Back to his day.

Game tips off. Mark checks the app periodically. His player is having a quiet first quarter — but that's fine, it's early.

**Climax:** Halftime. Mark's phone buzzes with an alert he's never seen before: *"Mozgov Rule triggered. [Player] has played fewer than 5 minutes. You have until the end of halftime to select a replacement."* Mark stares at his phone. He opens the app. The replacement window is open. He has 11 minutes. The eligible players list is right there. He picks the guy he almost picked the first time. Confirms. The app tells him the replacement gets full-game credit including first-half stats.

**Resolution:** His replacement player goes off in the second half. Mark ends up third for the game — his best finish yet. He's already thinking about Game 3.

**Capabilities revealed:** Push notifications, pick confirmation flow, Mozgov Rule detection and alert, halftime replacement window, replacement scoring with retroactive first-half credit, in-app eligibility list during replacement window.

*(Emoji reactions on game results are targeted for Phase 2.)*

---

### Journey 4 — Andrew: The Meeting That Couldn't Stop His Pick

**Opening Scene:** Andrew checks his calendar the night before Game 3. Back-to-back meetings from 10am to 2pm. The draft is open and picks could happen any time before tip-off. He can't risk missing his window and getting auto-assigned with no input.

**Rising Action:** The night before, Andrew opens the app. His preference list from Game 2 is still there — the system carried it forward with ineligible players already filtered out. His top pick from last game is no longer eligible (already drafted earlier in the series), so the list starts with his second choice. He reviews it, adds a new player to the top, saves it. The app confirms: *"If your clock expires, we'll auto-select your first available eligible pick."*

**Climax:** 11:43am. Andrew is in a meeting. His turn comes up in the draft feed. The clock runs. 45 minutes pass. The system checks his preference list — his first choice is available and eligible. Pick submitted automatically. The draft feed updates in real time: *"Andrew: [Player] (auto — preference list)."* Every other participant sees it immediately.

**Resolution:** Andrew comes out of his second meeting, checks the app, and sees his pick, his draft position, and the current standings. He didn't miss a thing. The "(auto — preference list)" label shows the league he was prepared, not absent. No commissioner intervention needed. No texts to Todd.

**Capabilities revealed:** Pre-draft preference list with game-to-game persistence, automatic eligibility filtering at execution time, two auto-pick labels (`auto — preference list` vs `auto — system`), real-time draft feed visibility of auto-picks, preference list privacy (not visible to commissioner or admin).

---

### Journey Requirements Summary

| Capability Area | Journeys |
|---|---|
| League creation & multi-league support | Todd |
| Commissioner delegation & admin oversight | Todd |
| Role-based access (preference list privacy) | Todd, Andrew |
| Invite system | All |
| Draft order generation & real-time open feed | Jake, Mark, Andrew |
| Eligible player browsing | Jake, Mark, Andrew |
| Pick confirmation flow | Mark |
| Pre-draft preference list (persistent, eligibility-filtered) | Andrew, Jake |
| Two auto-pick types with distinct labels | Andrew |
| Push notifications (turn, reminder, Mozgov, results) | All |
| Mozgov Rule detection, alert & replacement window | Mark |
| Real-time box score / live score tracking | Jake |
| Standings with category leaders | Jake |
| Emoji reactions on results & Mozgov events *(Phase 2)* | Mark |
| Post-game stat corrections & draft order updates | Todd |
| Commissioner override | Todd |
| Admin cross-league visibility & controls | Todd |

## Domain-Specific Requirements

### Sports Data API

A third-party NBA box score provider must be identified and evaluated before development. Key criteria: intra-game updates with player minutes available at halftime (not post-game only), stat correction events, uptime during playoff traffic, and licensing appropriate for a small-scale app. Provider selection affects availability SLAs, correction propagation timing, and integration architecture — this is a pre-development gate. Candidates to evaluate: BallDontLie (free tier), Sportradar (commercial), SportsData.io, the official NBA Stats API.

### Privacy & Access Control

Preference list privacy enforced at the API layer — commissioner and admin roles are explicitly blocked from reading any participant's preference list, regardless of request parameters. No payment processing on-platform; prizes managed externally by the commissioner.

### Legal Exposure

Platform is not a gambling or payment service — no licensing requirements in that space. Invite-only access with no public leagues minimizes liability surface.

## Innovation & Novel Patterns

### Detected Innovation Areas

**The Mozgov Rule — Mid-Game Replacement Window**
A halftime replacement mechanic triggered when a drafted player has logged fewer than 5 minutes. No mainstream fantasy platform (ESPN, Yahoo, DraftKings, FanDuel) has an equivalent. The rule converts a passive frustration (player not playing) into an active, time-pressured decision — the original player's stats are voided entirely and the replacement earns full-game fantasy credit (both halves, all scoring categories), making the window consequential rather than consolatory. Strategic edge: late-order pickers may deliberately select a borderline-active player expecting Mozgov to trigger, giving them a second pick from whoever is performing best in the first half — a valid and intentional mechanic. This is the product's most distinctive game mechanic.

**Inverted Series Draft Order — Sustained Competitive Balance**
Draft order per game is determined by inverse cumulative series standings: worst score picks first. A deliberate fairness mechanism preventing early runaway leaders from compounding advantages. Creates a strategic meta-game — draft position is earned or surrendered through game-to-game performance.

**Deliberate Minimalism as Core Design Principle**
One pick. One game. No roster. No season commitment. This is the product philosophy, not MVP scope constraint. The design inverts the complexity model of existing fantasy platforms. Minimalism is a protected design constraint: future features must reduce coordination cost, not add management overhead.

### Market Context

Existing platforms (ESPN, Yahoo, DraftKings, FanDuel) target season-long or daily roster engagement. None offer a series-scoped, single-pick format with mid-game correction mechanics. The closest analogues (DraftKings/FanDuel single-game contests) are public prize-money platforms with complex lineups — not social, invite-only, series-long experiences. NBA Fantasy Finals occupies an uncontested gap: casual engagement depth for friend groups who want shared investment in playoff basketball without commitment.

### Validation Approach

- **Mozgov Rule:** Replacement window engagement rate — high engagement confirms genuine tension, not confusion
- **Inverted draft order:** Series-long score variance — a balanced mechanism produces tighter final standings
- **Minimalism:** Pick submission rate without commissioner reminders — low reminder dependency confirms low-friction design

### Risk Mitigation

- **Mozgov Rule complexity:** Window timing and retroactive scoring credit must be communicated clearly at trigger time — in-app notification and UI copy are load-bearing for this mechanic
- **Minimalism drift:** Design principle must be explicitly documented as a decision constraint to survive future feature requests

## Web App Requirements

### Platform

PWA-capable SPA. Mobile-first. No native app planned. SPA architecture required; framework TBD in architecture phase.

### Browser Support

- Chrome (latest 2) — primary desktop and Android
- Safari (latest 2) — primary iOS
- Firefox (latest 2) — secondary desktop
- Arc (Chromium-based, covered by Chrome)
- No legacy browser support

### Responsive Design

All core flows (pick submission, draft feed, standings, Mozgov window) fully usable on a mobile browser. Desktop: same functionality, wider layout. PWA installation prompt supported where platform allows (Chrome/Android, Safari/iOS Add to Home Screen).

### SEO

Not applicable — invite-only, auth-gated. No public content to index.

### Implementation Notes

- Real-time draft feed and live scoring via polling (< 3s for draft, < 60s for scores); WebSocket optional for MVP
- PWA manifest and service worker for installability
- Web push via FCM for all notification types

## Functional Requirements

### League & User Management

- **FR1:** Commissioner can create a league scoped to a specific NBA playoff series
- **FR2:** Commissioner can generate and share invite links for a league
- **FR3:** Commissioner can delegate the commissioner role for a league to another participant
- **FR4:** Commissioner can create and manage multiple independent leagues
- **FR5:** Admin can view and take action on all leagues across the platform
- **FR6:** Participant can join a league using an invite link
- **FR7:** System restricts league access to invited participants only

### Player Eligibility

- **FR8:** System enforces player eligibility rules: (a) active for tonight's game (eligible to play — on game roster, not injured; DNP due to injury does not count as active), (b) not previously used by this participant in the current series (per-person exclusivity — each participant may use each player only once per series, regardless of other participants' picks), (c) not double-drafted in the same game

### Draft Management

- **FR9:** System generates draft order randomly for Game 1 and by inverse cumulative series standings for subsequent games. Tie-breaking rule: if two participants have equal fantasy scores in a game, the participant with the higher draft pick number in that game (i.e., picked later) earns the earlier pick in the next game's draft order
- **FR10:** System publishes draft order approximately 30 minutes after final game scores are confirmed. Draft window opens automatically at 9am PST the morning following the previous game's conclusion. Participants may set or update their preference list immediately after draft order is published (before the 9am window opens). Sequential selection clocks begin at draft window open. Draft closes at tip-off of the next game
- **FR11:** Participant can browse a personalized list of eligible players during their draft turn. Players already used by this participant in the current series are shown as unavailable (dimmed, non-selectable) rather than hidden — providing awareness of their remaining player pool. Players used by other participants remain fully available to this participant
- **FR12:** Participant can submit a pick during their draft turn
- **FR13:** System enforces a per-pick selection clock of up to 1 hour
- **FR14:** System auto-assigns a pick on clock expiry using the participant's preference list if available, or a random eligible player otherwise
- **FR15:** System labels auto-assigned picks as `auto — preference list` or `auto — system`
- **FR16:** Draft feed displays all picks in real time as they are submitted

### Preference List

- **FR17:** Participant can create and maintain a ranked preference list before their draft turn
- **FR18:** System persists the preference list game-to-game, removing ineligible players at execution time
- **FR19:** Preference list is accessible only to the individual participant — commissioner and admin cannot view any participant's list

### Pick Confirmation & Commissioner Controls

- **FR20:** System requires explicit pick confirmation before finalizing any pick
- **FR21:** Commissioner can override any participant's submitted pick

### Mozgov Rule

- **FR22:** System detects when a drafted player is active for the game (eligible to play, not injured) but has played fewer than 5 minutes at halftime. Inactive/injured players (DNP) do not trigger the Mozgov Rule — the rule only applies to active players who failed to reach the minutes threshold
- **FR23:** System notifies all affected participants simultaneously and opens a replacement window at halftime. When multiple participants have the Mozgov Rule triggered in the same game, replacement selection proceeds in inverse draft-order sequence: the participant who picked last in that game's draft order selects first in the Mozgov window; subsequent participants select in descending draft-order (i.e., highest pick number first). Each triggered participant has a sequential 3-minute selection clock. The hard deadline is second-half tip-off — the window closes regardless of remaining clock time. If a participant's clock expires before they select, the system auto-assigns their replacement using the same preference list logic as FR14
- **FR24:** Participant can select a replacement player from a filtered eligible list during the replacement window. Mozgov replacement eligibility requires: (a) active for tonight's game, (b) played 5 or more minutes in the most recent game in which they were active (not necessarily the immediately prior game by number — accounts for players who missed games due to injury), and (c) not already used by this participant in the current series
- **FR25:** System voids the original player's fantasy points entirely and credits the replacement player with full-game fantasy points — the replacement player's complete box score for the entire game (both halves) counts toward the participant's score

### Live Scoring

- **FR26:** System retrieves box score data from a third-party NBA stats provider at the end of each quarter (Q1, Q2/halftime, Q3, and final buzzer). MVP update cadence is quarterly; real-time polling is a Phase 2 option
- **FR27:** System calculates fantasy points using: 1×PTS + 2×REB + 2×AST + 3×STL + 3×BLK
- **FR28:** Participant can view their player's current fantasy point total, updated at the end of each quarter. Standings display a "LIVE · Q[n]" indicator during active games and "FINAL" after the final buzzer

### Post-Game Corrections

- **FR29:** System applies post-game official stat corrections automatically to fantasy point totals
- **FR30:** System recalculates standings and draft order when stat corrections affect previously computed values
- **FR31:** System ensures stat correction propagation completes before the next draft window opens

### Standings & Results

- **FR32:** System maintains a series leaderboard showing cumulative fantasy points per participant
- **FR33:** System displays the per-game winner and full stat breakdown after each game: Pts / Reb / Ast / Stl / Blk / Fantasy Total per participant's player
- **FR34:** System highlights the per-game leader in each scoring category (Pts, Reb, Ast, Stl, Blk, Fantasy Total) within the game's stat breakdown. Each participant's burned player list (players used in prior games of the series) is visible to all league participants
- **FR45:** System displays the draft pick order number alongside each pick in the draft feed and game history (e.g., "Jake picked Shai · pick #1"), providing series-long draft history context

### Notifications

- **FR35:** System sends a push notification when draft order is published (~30 min after final scores post) and a second notification when the draft window opens at 9am PST. Draft open notification includes a direct link to set or review preference list
- **FR36:** System sends a push notification when it is a participant's turn to pick, deep-linking directly to the pick screen
- **FR37:** System sends a pick reminder push notification when fewer than 10 minutes remain on a participant's selection clock
- **FR38:** System sends a push notification to the affected participant when the Mozgov Rule is triggered
- **FR39:** System sends a push notification when game results and updated standings are posted
- **FR40:** System delivers all push notifications via FCM-backed web push without requiring a native app

### User Access & Authentication

- **FR41:** Users can register and authenticate to access the platform *(authentication method TBD in architecture — recommended options: magic link / passwordless email for low friction, or OAuth via Google/Apple for zero-password UX; email+password is a viable fallback)*
- **FR42:** System enforces role-based access control with distinct permissions for participant, commissioner, and admin roles
- **FR43:** Preference list read access is restricted to the individual participant at the API layer, regardless of role
- **FR44:** Participant can view the complete draft history for the current series, including all picks made in prior games

## Non-Functional Requirements

### Performance

- Time to Interactive (TTI): < 3s on 4G
- First Contentful Paint (FCP): < 1.5s
- Draft feed pick updates: < 3s from submission to visible to all participants
- Live score updates: < 60s from official NBA stat publication
- Mozgov Rule push notification: < 30s from halftime detection
- Mozgov replacement window load: < 2s from app open

### Availability

- 99.5% uptime required during: draft windows (day-before open through tip-off) and Mozgov halftime windows (~15 min per game)
- Outside these windows: best-effort; no SLA required
- No deployments during active draft or game windows

### Security

- HTTPS for all traffic
- Authentication required for all app routes
- RBAC enforced at API layer — UI-level restrictions insufficient
- Preference list data never returned to commissioner or admin roles via API, regardless of request parameters
- No PCI-DSS, HIPAA, or GDPR obligations beyond basic user account data handling

### Integration

- **NBA stats API:** Intra-game updates required (player minutes at halftime, not post-game only); post-game correction events; uptime during playoff windows. Provider evaluation is a pre-development gate.
- **FCM:** Web push for all notification types; no native app required; latency must meet performance targets above

### Scalability

- Scale: tens to low hundreds of total users across all leagues
- Traffic pattern: bursty during draft and game windows, low otherwise
- Concurrent draft activity must not produce race conditions on pick assignment or eligibility state
- No thousands-of-concurrent-users requirement for MVP

### Accessibility

- Semantic HTML for all core flows
- Keyboard navigability for pick submission, draft feed, and standings
- Sufficient color contrast for mobile and desktop readability
- WCAG AA not required; reasonable baseline is the target
