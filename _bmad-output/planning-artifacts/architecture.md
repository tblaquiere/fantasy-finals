---
stepsCompleted: [step-01-init, step-02-context, step-03-starter, step-04-decisions, step-05-patterns, step-06-structure, step-07-validation, step-08-complete]
lastStep: 8
status: 'complete'
completedAt: '2026-03-06'
inputDocuments: ['_bmad-output/planning-artifacts/prd.md']
workflowType: 'architecture'
project_name: 'fantasy-finals'
user_name: 'Todd'
date: '2026-03-06'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:** 44 FRs across 9 capability areas. Core game loop is fully automated: draft opens, clock runs, picks submit (or auto-assign), game plays, Mozgov window fires at halftime if triggered, game ends, stats correct, standings update, next draft opens. Commissioner and admin actions are exception paths — not the primary flow.

**Non-Functional Requirements:**
- Performance: TTI <3s/4G, draft updates <3s, live scores <60s, Mozgov push <30s
- Availability: 99.5% during draft windows and Mozgov halftime windows only; best-effort otherwise
- Security: HTTPS, full auth gating, RBAC at API layer (not UI), preference list data never exposed to commissioner/admin roles
- Integration: NBA stats API (intra-game halftime data required), FCM web push
- Scalability: tens to low hundreds users; bursty during draft/game windows; no race conditions on pick assignment or eligibility state
- Accessibility: semantic HTML, keyboard nav, reasonable color contrast baseline

**Scale & Complexity:**
- Primary domain: full-stack web (PWA SPA + API backend)
- Complexity level: medium-high
- Estimated architectural components: ~7 (frontend SPA, API server, database, scheduler/worker, NBA stats integration, FCM integration, real-time/polling layer)

### Technical Constraints & Dependencies

- **NBA stats API:** **Selected provider: `nba_api` / stats.nba.com (unofficial, free).** Live box score endpoint returns per-player `min` field in real time during active games — sufficient for Mozgov halftime detection. Known risk: cloud-hosted IPs (including Railway) may be rate-limited or blocked by NBA.com; mitigate with custom `User-Agent` headers, a 3–5s polling interval (not aggressive), and graceful degradation to last-known data on failure. Provider swap requires changes to `nba-stats.ts` only — upgrade path to BallDontLie GOAT ($39.99/mo) before next season if reliability proves insufficient. **Manual commissioner-triggered Mozgov window is a first-class feature** (not a fallback) — the commissioner can open the Mozgov window manually regardless of auto-detection status.
- **FCM (Firebase Cloud Messaging):** Explicit platform decision for web push. All 5 notification types delivered via FCM — no native app.
- **PWA:** SPA architecture, service worker, PWA manifest required. Framework TBD.
- **Auth method:** TBD — magic link, OAuth (Google/Apple), or email+password. Affects onboarding UX and invite-link flow.
- **Solo developer:** Architectural complexity must be manageable without a team.

### Cross-Cutting Concerns Identified

1. **Real-time state sync** — Draft feed, live scores, Mozgov window all require low-latency updates across all connected clients
2. **Transactional pick safety** — Eligibility check and pick assignment must be atomic to prevent race conditions in concurrent draft scenarios
3. **Event-driven scheduling** — Selection clock expiry, draft auto-open, halftime detection, post-game triggers all require a reliable background scheduler
4. **Multi-tenancy** — League isolation must be enforced at the data model and API layer; commissioner delegation and admin cross-league access must not bleed across league boundaries
5. **RBAC / data privacy** — Preference list access restricted at API layer regardless of role; server must enforce, not just the UI
6. **External API resilience** — NBA stats provider is a single point of failure for live scoring, Mozgov detection, and post-game corrections
7. **Notification delivery** — FCM web push must fire within strict latency targets (<30s for Mozgov, <3s for turn notifications)

## Starter Template Evaluation

### Primary Technology Domain

Full-stack web (React SPA + API backend) with persistent background scheduler and external integrations (NBA stats API, FCM). Persistent server required — serverless-only deployment not viable due to selection clock and halftime detection scheduling requirements.

### Starter Options Considered

**T3 Stack (create-t3-app):** React + Next.js 15 + TypeScript + tRPC + Prisma + Tailwind + NextAuth.js. 28k+ GitHub stars, actively maintained, excellent solo developer DX. End-to-end type safety from DB schema to React components.

**Vite React + Hono monorepo:** Explicit frontend/backend separation. More setup required, more manual decisions. Better fit for teams with strong backend confidence. Ruled out — more stretching than required.

### Selected Starter: T3 Stack

**Rationale for Selection:**
- React-first, matches developer preference
- Maximum decisions made upfront — language (TypeScript), ORM (Prisma), API layer (tRPC), styling (Tailwind), auth (NextAuth.js)
- NextAuth.js supports magic link, OAuth (Google/Apple), and email+password without additional setup
- Prisma + PostgreSQL: relational model well-suited to leagues, picks, standings, draft state
- tRPC: type-safe API calls without code generation, excellent with React
- Deploy to Railway (persistent Node.js server, not Vercel serverless)
- Background jobs: add pg-boss (PostgreSQL-backed queue, zero additional infrastructure — reuses existing DB)

**Initialization Command:**

```bash
npx create-t3-app@latest fantasy-finals \
  --nextAuth \
  --prisma \
  --tailwind \
  --trpc \
  --appRouter \
  --noGit
```

**Architectural Decisions Provided by Starter:**

**Language & Runtime:** TypeScript (strict mode), Node.js

**Styling Solution:** Tailwind CSS utility-first, no component library committed (can add shadcn/ui post-init)

**Build Tooling:** Next.js 15 with Turbopack (dev), standard Next.js build (prod)

**ORM & Database:** Prisma with PostgreSQL

**API Layer:** tRPC — type-safe end-to-end, co-located with Next.js server

**Auth:** NextAuth.js — magic link, OAuth, and email+password all supported; selection deferred to architecture decisions

**Code Organization:** src/ directory, App Router, server/ for tRPC routers and DB access, components/ for React

**Development Experience:** Hot reload (Turbopack), TypeScript type checking, ESLint, environment variable validation (t3-env)

**Additional Layer (not in starter — add post-init):**
- `pg-boss`: PostgreSQL-backed background job queue for selection clocks, draft scheduling, halftime detection polling, auto-assign triggers
- Runs as a worker process alongside Next.js (same Railway project, separate process)

**Note:** Project initialization using this command should be the first implementation story.

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (Block Implementation):**
- Auth method: magic link (primary) + Google OAuth (optional) via NextAuth.js
- Database hosting: Railway managed PostgreSQL
- Background job queue: pg-boss (PostgreSQL-backed, no Redis)
- Real-time approach: polling (draft feed <3s, live scores <30–60s)

**Important Decisions (Shape Architecture):**
- Component library: shadcn/ui (Radix UI + Tailwind, code-owned)
- State management: tRPC + React Query (no additional state library)
- PWA: next-pwa library
- CI/CD: GitHub Actions → Railway deploy hook

**Deferred Decisions (Post-MVP):**
- WebSocket upgrade for real-time (polling sufficient for MVP scale)
- External monitoring service (Railway logs sufficient for MVP)

### Data Architecture

- **Database:** PostgreSQL, hosted on Railway managed Postgres
  - Rationale: single platform with app deployment, one operational context
- **ORM:** Prisma (provided by T3 starter)
  - Migration approach: Prisma Migrate (dev) → `prisma migrate deploy` (prod)
- **Validation:** Zod — consistent across tRPC input schemas, NextAuth callbacks, and environment variables (t3-env)
- **Job Queue:** pg-boss — PostgreSQL-backed, reuses existing DB connection, no Redis infrastructure required
  - Jobs: selection clock expiry, draft auto-open, halftime detection polling, auto-assign triggers, post-game stat correction propagation
- **Caching:** None for MVP — scale (tens to low hundreds of users) does not warrant cache layer

### Authentication & Security

- **Auth method:** Magic link (primary) + Google OAuth (optional), via NextAuth.js
  - Rationale: lowest friction for invite-link onboarding on mobile; no passwords to forget; NextAuth.js handles both natively
  - Invite flow: click invite link → enter email → click magic link → in app
- **Session management:** NextAuth.js JWT sessions
- **RBAC:** tRPC middleware (context-based) — role injected into tRPC context from session; procedures check role before executing
  - Roles: participant, commissioner, admin
  - Preference list: separate tRPC procedure with explicit participant-only guard; returns 403 for any other role regardless of parameters
- **API security:** tRPC procedures require authenticated session by default; public procedures explicitly marked
- **Transport:** HTTPS enforced at Railway level

### API & Communication Patterns

- **API layer:** tRPC — type-safe end-to-end, co-located with Next.js (provided by T3 starter)
- **Real-time:** Polling
  - Draft feed: 3s polling interval during active draft window
  - Live scores: 30s polling interval during active games (within 60s NFR)
  - Mozgov window: 5s polling interval when replacement window is open
  - WebSocket deferred to post-MVP
- **Error handling:** tRPC built-in error types (UNAUTHORIZED, FORBIDDEN, NOT_FOUND, BAD_REQUEST) + Zod validation errors surfaced automatically
- **NBA stats API:** Abstracted behind an internal service module — provider swap does not require tRPC router changes

### Frontend Architecture

- **Framework:** React + Next.js 15 App Router (provided by T3 starter)
- **Styling:** Tailwind CSS (provided by T3 starter)
- **Component library:** shadcn/ui — Radix UI primitives + Tailwind, code copied into repo (not an npm dependency)
  - Key components: modals (pick confirmation, Mozgov alert), sheets (draft feed), tables (standings), forms (preference list, league creation)
- **State management:** tRPC + React Query (built into T3) — handles all server state; no Zustand/Redux needed at this scale
- **PWA:** next-pwa — service worker and manifest for installability (Chrome/Android, Safari Add to Home Screen)
- **Mobile-first:** Tailwind responsive classes; all core flows designed for mobile viewport first

### Infrastructure & Deployment

- **Hosting:** Railway
  - Next.js server: persistent Node.js process (not serverless)
  - pg-boss worker: separate process in same Railway project
  - PostgreSQL: Railway managed
- **CI/CD:** GitHub Actions — lint + type-check on PR; deploy to Railway on merge to main via Railway deploy hook
- **Environments:** local (dev) + prod (Railway); no staging for MVP
- **Monitoring:** Railway logs for MVP; no external APM service
- **Deployments:** Blocked during active draft or game windows (NFR requirement); enforced by deploy script checking game state before deploy

### Decision Impact Analysis

**Implementation Sequence:**
1. Project init (T3 starter command)
2. Railway project + PostgreSQL provisioned
3. Prisma schema (core data model)
4. NextAuth.js configured (magic link + Google OAuth)
5. RBAC tRPC middleware
6. pg-boss worker scaffold
7. shadcn/ui components installed
8. Feature development (game loop FRs)

**Cross-Component Dependencies:**
- pg-boss worker reads/writes same PostgreSQL DB as Next.js server — both use Prisma client; job definitions must coordinate on shared state
- tRPC RBAC context feeds from NextAuth.js session — auth and API layers are tightly coupled by design
- Real-time polling relies on tRPC queries with `refetchInterval` — polling interval is a client-side React Query configuration, not server infrastructure
- FCM integration: server-side tRPC mutation (or pg-boss job) triggers FCM send; client receives via browser push event listener registered in service worker

## Implementation Patterns & Consistency Rules

### Critical Conflict Points Identified

6 areas where AI agents could make different choices: naming conventions, project structure, data formats, job naming, error handling, RBAC enforcement.

### Naming Patterns

**Database Naming Conventions (Prisma):**
- Model names: PascalCase singular — `User`, `League`, `Pick`, `Game`, `DraftSlot`
- Field names: camelCase — `userId`, `leagueId`, `createdAt`, `fantasyPoints`
- DB column mapping: snake_case via `@map` — `@map("user_id")`, `@map("created_at")`
- Table mapping: snake_case via `@@map` — `@@map("draft_slots")`
- IDs: `cuid2` string (Prisma default) — never integer auto-increment

```prisma
model Pick {
  id            String   @id @default(cuid())
  fantasyPoints Int
  userId        String   @map("user_id")
  leagueId      String   @map("league_id")
  createdAt     DateTime @default(now()) @map("created_at")

  @@map("picks")
}
```

**tRPC Naming Conventions:**
- Router names: camelCase noun matching domain — `league`, `draft`, `pick`, `player`, `standing`, `preference`, `mozgov`
- Procedure names: camelCase verb+noun — `getLeague`, `createPick`, `submitPick`, `getStandings`, `triggerMozgov`
- Input schemas: Zod object inline — `z.object({ leagueId: z.string() })`

**pg-boss Job Naming:**
- Pattern: `domain.action` (dot-separated)
- Examples: `draft.open`, `clock.expire`, `halftime.check`, `stats.correct`, `pick.autoAssign`, `notification.send`

**FCM Notification Types:**
- Pattern: kebab-case — `draft-open`, `turn-notify`, `pick-reminder`, `mozgov-trigger`, `results-posted`

**Code Naming Conventions:**
- React components: PascalCase files — `DraftFeed.tsx`, `PickConfirmModal.tsx`
- Utility functions: camelCase — `formatFantasyPoints`, `isPlayerEligible`, `calcDraftOrder`
- Next.js route folders: kebab-case — `league/[leagueId]/draft/page.tsx`
- Constants: SCREAMING_SNAKE_CASE — `MAX_CLOCK_MINUTES`, `MOZGOV_THRESHOLD_MINUTES`
- Types/interfaces: PascalCase — `LeagueWithParticipants`, `DraftState`

### Structure Patterns

**Project Organization:**
```
src/
  app/                          # Next.js App Router pages
    (auth)/                     # Auth-gated route group
      league/[leagueId]/
        draft/page.tsx
        standings/page.tsx
    api/
      auth/[...nextauth]/       # NextAuth.js
      trpc/[trpc]/              # tRPC handler
  server/
    api/
      routers/                  # One file per domain
        league.ts
        draft.ts
        pick.ts
        player.ts
        standing.ts
        preference.ts
        mozgov.ts
      root.ts                   # AppRouter assembly
      trpc.ts                   # tRPC init, context, middleware
    services/                   # External integrations + domain services
      nba-stats.ts              # NBA stats API abstraction
      fcm.ts                    # FCM send wrapper
      scoring.ts                # Fantasy point calculation
      eligibility.ts            # Player eligibility rules
    db.ts                       # Prisma client singleton
  worker/
    index.ts                    # pg-boss worker entry point
    jobs/                       # One file per job type
      draft-open.ts
      clock-expire.ts
      halftime-check.ts
      stats-correct.ts
  components/
    ui/                         # shadcn/ui components (do not modify)
    draft/                      # Draft feature components
    standings/                  # Standings feature components
    league/                     # League management components
    shared/                     # Cross-feature shared components
  lib/
    utils.ts                    # shadcn/ui utils (cn helper)
    constants.ts                # App-wide constants
```

**Test File Location:** Co-located with source — `scoring.test.ts` next to `scoring.ts`. No separate `__tests__/` directory.

**shadcn/ui Rule:** Components in `src/components/ui/` are never modified directly. Customization goes in feature component wrappers.

### Format Patterns

**API Response Formats:**
- tRPC handles response serialization — no manual response wrapper
- Procedures return typed objects directly: `return { league, participants }`
- Dates: JavaScript `Date` objects in Prisma → ISO 8601 strings over wire (tRPC serializes automatically)
- Fantasy points: integer (scoring formula produces whole numbers; store and transmit as `Int`, never `Float`)
- Booleans: `true`/`false` (never `1`/`0`)
- Null vs undefined: use `null` for intentionally absent values in DB; use `undefined` for optional tRPC inputs

**Error Response Structure:**
- Throw `TRPCError` with semantic code:
  ```ts
  throw new TRPCError({ code: "FORBIDDEN", message: "Preference lists are private" })
  throw new TRPCError({ code: "BAD_REQUEST", message: "Player not eligible" })
  throw new TRPCError({ code: "NOT_FOUND", message: "League not found" })
  ```
- Never return `{ success: false, error: "..." }` — always throw

### Communication Patterns

**pg-boss Job Payloads:**
- Always typed; validated with Zod on receipt
- Always include `leagueId` and `gameId` for traceability
- Example:
  ```ts
  type ClockExpirePayload = { pickId: string; leagueId: string; gameId: string }
  ```

**Polling Intervals:**
- Active draft feed: `refetchInterval: 3000`
- Live scores during game: `refetchInterval: 30000`
- Active Mozgov window: `refetchInterval: 5000`
- Disable polling when tab not focused: `refetchIntervalInBackground: false`
- No polling outside active windows — queries return cached data

**State Management:**
- All server state via tRPC + React Query — no manual fetch calls
- No Zustand/Redux — use React `useState` for client-only UI state
- Optimistic updates only where explicitly specified in story

### Process Patterns

**Error Handling:**
- tRPC procedures: always `throw TRPCError` (never return error objects)
- Client-side: catch tRPC errors in React Query `onError`; display via shadcn/ui `Toaster` for user-facing errors
- Worker jobs: log error + schedule retry via pg-boss retry config; never silently swallow errors
- Unrecoverable errors: log to Railway, surface to admin via notification

**Loading States:**
- `isLoading`: show shadcn/ui `Skeleton` component (initial load only)
- `isFetching`: show subtle indicator (not full skeleton) for background refresh
- No full-page loading spinners — skeleton layouts only
- Time-pressured flows (Mozgov window, pick turn): show countdown, never block UI while fetching

**RBAC Enforcement:**
- Role check in tRPC middleware, never in React components
- Every protected procedure calls `enforceRole(ctx, ["participant"])` or `enforceRole(ctx, ["commissioner", "admin"])` as first statement
- Preference list procedures: explicit `enforceOwner(ctx, userId)` — ownership-based, not role-based
- Frontend hides UI for unauthorized actions (UX only); API enforces regardless

### Enforcement Guidelines

**All AI Agents MUST:**
- Use `cuid2` string IDs — never integer auto-increment
- Map Prisma fields to snake_case DB columns via `@map`/`@@map`
- Throw `TRPCError` — never return error objects from procedures
- Place external service calls in `src/server/services/` — never inline in routers
- Name pg-boss jobs as `domain.action` (e.g., `draft.open`)
- Disable polling when tab is not focused (`refetchIntervalInBackground: false`)
- Check role in tRPC middleware — never in React component render

**Anti-Patterns:**
```ts
// WRONG: integer ID
id Int @id @default(autoincrement())
// RIGHT: cuid2 string
id String @id @default(cuid())

// WRONG: error object returned
return { success: false, error: "Not eligible" }
// RIGHT: TRPCError thrown
throw new TRPCError({ code: "BAD_REQUEST", message: "Player not eligible" })

// WRONG: NBA API called inline in router
const stats = await fetch("https://nba-api.com/...")
// RIGHT: abstracted in service module
const stats = await nbaStatsService.getBoxScore(gameId)

// WRONG: role check in component
if (session.user.role === "commissioner") return <Override />
// RIGHT: role enforced in procedure; component receives permitted data only
```

## Project Structure & Boundaries

### Complete Project Directory Structure

```
fantasy-finals/
├── README.md
├── package.json
├── next.config.js
├── tailwind.config.ts
├── tsconfig.json
├── .env.example
├── .gitignore
├── .github/
│   └── workflows/
│       └── ci.yml                     # lint + type-check + Railway deploy
├── prisma/
│   ├── schema.prisma                  # All models: User, League, Game, Pick,
│   │                                  #   DraftSlot, PreferenceItem, Standing
│   └── migrations/
├── public/
│   ├── manifest.json                  # PWA manifest
│   ├── sw.js                          # next-pwa service worker (generated)
│   └── icons/                         # PWA icons (192, 512)
└── src/
    ├── middleware.ts                   # NextAuth session enforcement (all routes)
    ├── env.js                          # t3-env environment variable validation
    ├── app/
    │   ├── globals.css
    │   ├── layout.tsx                  # Root layout + Toaster
    │   ├── page.tsx                    # Landing → redirect to dashboard
    │   ├── (auth)/                     # Auth-gated route group
    │   │   ├── layout.tsx
    │   │   ├── dashboard/
    │   │   │   └── page.tsx            # My leagues overview
    │   │   └── league/
    │   │       └── [leagueId]/
    │   │           ├── layout.tsx
    │   │           ├── page.tsx        # League home / current game
    │   │           ├── draft/
    │   │           │   └── page.tsx   # Draft feed + pick UI (FR9-16)
    │   │           ├── standings/
    │   │           │   └── page.tsx   # Series leaderboard + categories (FR32-34)
    │   │           ├── history/
    │   │           │   └── page.tsx   # Series-long draft history (FR44)
    │   │           └── settings/
    │   │               └── page.tsx   # Commissioner controls (FR3, FR21)
    │   ├── admin/
    │   │   └── page.tsx               # Admin cross-league view (FR5)
    │   ├── join/
    │   │   └── [token]/
    │   │       └── page.tsx           # Invite link handler (FR6)
    │   └── api/
    │       ├── auth/
    │       │   └── [...nextauth]/
    │       │       └── route.ts       # Magic link + Google OAuth (FR41)
    │       └── trpc/
    │           └── [trpc]/
    │               └── route.ts
    ├── server/
    │   ├── auth.ts                     # NextAuth.js config
    │   ├── db.ts                       # Prisma client singleton
    │   ├── api/
    │   │   ├── root.ts                 # AppRouter assembly
    │   │   ├── trpc.ts                 # tRPC init, context, RBAC middleware
    │   │   └── routers/
    │   │       ├── league.ts           # FR1-7: CRUD, invites, multi-league
    │   │       ├── draft.ts            # FR9-16: order, clock, feed
    │   │       ├── pick.ts             # FR12, FR20-21: submit, confirm, override
    │   │       ├── player.ts           # FR8, FR11: eligible players, roster
    │   │       ├── preference.ts       # FR17-19: preference list (owner-only)
    │   │       ├── mozgov.ts           # FR22-25: detection, replacement window
    │   │       ├── standing.ts         # FR32-34: leaderboard, game, categories
    │   │       └── notification.ts     # FR35-40: push subscription management
    │   └── services/
    │       ├── nba-stats.ts            # NBA stats API abstraction (provider-agnostic)
    │       ├── fcm.ts                  # FCM web push sender
    │       ├── scoring.ts              # Fantasy point calculation — pure fn (FR27)
    │       ├── eligibility.ts          # Player eligibility rules (FR8)
    │       └── draft-order.ts          # Draft order calculation (FR9)
    ├── worker/
    │   ├── index.ts                    # pg-boss init + job registration
    │   └── jobs/
    │       ├── draft-open.ts           # Fires day before tip-off (FR10)
    │       ├── clock-expire.ts         # Clock expiry → auto-assign (FR13-15)
    │       ├── halftime-check.ts       # Polls NBA API → Mozgov trigger (FR22)
    │       └── stats-correct.ts        # Post-game correction propagation (FR29-31)
    ├── components/
    │   ├── ui/                         # shadcn/ui — never modify directly
    │   │   ├── button.tsx
    │   │   ├── dialog.tsx
    │   │   ├── skeleton.tsx
    │   │   ├── table.tsx
    │   │   ├── sonner.tsx
    │   │   └── ...
    │   ├── draft/
    │   │   ├── DraftFeed.tsx           # Real-time pick feed (FR16)
    │   │   ├── PlayerList.tsx          # Eligible player browser (FR11)
    │   │   ├── PickConfirmModal.tsx     # Confirmation dialog (FR20)
    │   │   ├── SelectionClock.tsx      # Countdown display (FR13)
    │   │   └── AutoAssignBadge.tsx     # "auto — preference list" label (FR15)
    │   ├── mozgov/
    │   │   ├── MozgovAlert.tsx         # Halftime alert overlay (FR23)
    │   │   └── ReplacementWindow.tsx   # Replacement selection (FR24-25)
    │   ├── standings/
    │   │   ├── SeriesLeaderboard.tsx   # Cumulative standings (FR32)
    │   │   ├── GameResult.tsx          # Per-game winner (FR33)
    │   │   └── CategoryLeaders.tsx     # Category leaders (FR34)
    │   ├── league/
    │   │   ├── LeagueCard.tsx
    │   │   ├── CreateLeagueForm.tsx    # League creation (FR1)
    │   │   ├── InviteLink.tsx          # Invite link display/copy (FR2)
    │   │   └── CommissionerControls.tsx # Override + delegate (FR3, FR21)
    │   ├── preference/
    │   │   └── PreferenceList.tsx      # Ranked preference list editor (FR17-19)
    │   └── shared/
    │       ├── LiveScoreDisplay.tsx    # Player's live fantasy points (FR28)
    │       └── PushPermissionPrompt.tsx # FCM subscription request (FR40)
    └── lib/
        ├── utils.ts                    # shadcn/ui cn() helper
        └── constants.ts               # MOZGOV_THRESHOLD_MINUTES=5,
                                        # MAX_CLOCK_MINUTES=60, etc.
```

### Architectural Boundaries

**API Boundaries:**
- All client→server communication via tRPC (`/api/trpc/[trpc]`)
- No REST endpoints except NextAuth (`/api/auth/[...nextauth]`) and tRPC handler
- External inbound: `nba-stats.ts` only — all NBA data enters here
- External outbound: `fcm.ts` only — all push notifications exit here

**Component Boundaries:**
- `page.tsx` files: React Server Components — initial data fetch via tRPC server-side caller
- Interactive components: marked `"use client"` — draft feed, modals, countdowns, preference list editor
- `components/ui/`: shadcn/ui primitives — never modified; wrap in feature components for customization

**Service Boundaries:**
- `nba-stats.ts`: sole NBA API contact point; returns normalized types; provider swap requires only this file
- `fcm.ts`: sole FCM contact point; called by worker jobs and tRPC mutations
- `scoring.ts`: pure function — no DB, no external calls; input: raw stats object; output: integer fantasy points
- `eligibility.ts`: DB-aware; enforces all three FR8 rules (active roster, not previously drafted in series, not double-drafted same game)

**Data Boundaries:**
- `db.ts` Prisma singleton: only import point for DB — no raw SQL anywhere
- Worker (`src/worker/`): shares Prisma client with Next.js server; both processes connect to same Railway PostgreSQL instance
- Preference list: only accessible through `routers/preference.ts`; `enforceOwner()` guard is the sole access control mechanism

### Requirements to Structure Mapping

| FR Area | Routers | Services | Jobs | Components |
|---|---|---|---|---|
| FR1-7 League & User Mgmt | `league.ts` | — | — | `league/` |
| FR8 Eligibility | `player.ts` | `eligibility.ts` | — | `draft/PlayerList.tsx` |
| FR9-16 Draft Mgmt | `draft.ts`, `pick.ts` | `draft-order.ts` | `draft-open.ts`, `clock-expire.ts` | `draft/` |
| FR17-19 Preference List | `preference.ts` | — | — | `preference/` |
| FR20-21 Pick + Override | `pick.ts` | — | — | `draft/PickConfirmModal.tsx` |
| FR22-25 Mozgov Rule | `mozgov.ts` | `eligibility.ts` | `halftime-check.ts` | `mozgov/` |
| FR26-28 Live Scoring | — | `nba-stats.ts`, `scoring.ts` | — | `shared/LiveScoreDisplay.tsx` |
| FR29-31 Post-game Corrections | — | `scoring.ts` | `stats-correct.ts` | — |
| FR32-34 Standings | `standing.ts` | — | — | `standings/` |
| FR35-40 Notifications | `notification.ts` | `fcm.ts` | all jobs | `shared/PushPermissionPrompt.tsx` |
| FR41-44 Auth & RBAC | — | — | — | `server/auth.ts`, `trpc.ts` |

### Integration Points

**Data Flow — User Pick Submission:**
```
Client (PickConfirmModal) → tRPC pick.submitPick
  → eligibility.ts (validate)
  → Prisma write (Pick record)
  → fcm.ts (notify next participant)
  → return pick to client
  → DraftFeed.tsx polls pick up within 3s
```

**Data Flow — Clock Expiry (Auto-assign):**
```
pg-boss clock.expire job fires
  → clock-expire.ts handler
  → preference.ts (read owner's list)
  → eligibility.ts (filter)
  → Prisma write (Pick with autoAssign=true)
  → fcm.ts (notify next participant)
```

**Data Flow — Mozgov Rule:**
```
pg-boss halftime.check job fires
  → nba-stats.ts (player minutes at halftime)
  → eligibility check (< 5 minutes played)
  → Prisma write (MozgovWindow opened)
  → fcm.ts (notify affected participant)
  → Client MozgovAlert.tsx polls window open
  → Participant selects replacement via mozgov.selectReplacement
  → scoring.ts (retroactive first-half credit applied)
```

**External Integration Points:**
- NBA stats API → `src/server/services/nba-stats.ts` (provider TBD)
- FCM → `src/server/services/fcm.ts` (Firebase project required)
- Railway PostgreSQL → Prisma connection string in `DATABASE_URL`
- Google OAuth → `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in env
- Magic link email → `EMAIL_SERVER_*` env vars (NextAuth email provider)

## Architecture Validation Results

### Coherence Validation

**Decision Compatibility:** Pass — T3 Stack (Next.js 15 + tRPC + Prisma + Tailwind + NextAuth.js), pg-boss, PostgreSQL, shadcn/ui, and Railway all integrate without conflicts. pg-boss uses PostgreSQL as its backing store, eliminating any Redis dependency. shadcn/ui is designed for Tailwind.

**Correction Applied — PWA package:** `next-pwa` (original) has incomplete Next.js 15 App Router support. Use `@ducanh2912/next-pwa` — the actively maintained App Router-compatible fork. All references to next-pwa in implementation should use this package.

**Pattern Consistency:** Pass — naming conventions (cuid2, camelCase tRPC procedures, `domain.action` pg-boss jobs), error handling (TRPCError only), RBAC (middleware-only), and service abstraction patterns are internally consistent and aligned with the chosen stack.

**Structure Alignment:** Pass — `src/worker/` alongside `src/server/` enables separate process deployment on Railway. Service abstraction layer in `src/server/services/` correctly isolates all external dependencies.

### Requirements Coverage Validation

**Functional Requirements Coverage:** Pass — all 44 FRs mapped to specific routers, services, jobs, and components. See Requirements to Structure Mapping table in Project Structure section.

**Critical Gap Resolved — Atomic Pick Assignment (NFR Scalability):**
The PRD explicitly requires no race conditions on pick assignment or eligibility state. Architectural mechanism:

- `pick.submitPick` tRPC procedure wraps eligibility check + pick write in a Prisma `$transaction`
- Prisma schema enforces a unique constraint: `@@unique([leagueId, gameId, playerId])`
- If two concurrent submissions attempt to pick the same player, the second transaction fails with a unique constraint violation → caught as `TRPCError({ code: "CONFLICT" })` → client displays "Player already picked"
- This must be implemented in `routers/pick.ts` — not optional

```prisma
model Pick {
  // ...
  @@unique([leagueId, gameId, playerId])  // Race condition guard
}
```

**Non-Functional Requirements Coverage:**
- Performance: polling intervals defined; persistent Railway server; pg-boss jobs handle time-sensitive Mozgov push (<30s)
- Availability: Railway persistent process (no cold starts); no deployments during active windows enforced by deploy script
- Security: HTTPS at Railway; RBAC in tRPC middleware; preference list enforceOwner(); all routes auth-gated via middleware.ts
- Scalability: Prisma transaction + unique constraint handles race conditions; polling architecture scales to hundreds of users without WebSocket complexity
- Accessibility: semantic HTML and keyboard nav are implementation-level concerns; shadcn/ui Radix primitives handle accessibility by default

### Implementation Readiness Validation

**Decision Completeness:** Pass — all critical decisions documented with rationale. Technology versions verified via web search.

**Structure Completeness:** Pass — complete file tree with every file named and annotated to its FR. Integration points and data flows documented.

**Pattern Completeness:** Pass — naming, structure, format, communication, error handling, loading states, and RBAC patterns all documented with examples and anti-patterns.

**Process Gap Resolved — Worker Deployment:**
The pg-boss worker (`src/worker/index.ts`) runs as a separate process on Railway alongside the Next.js server. Deployment mechanism:

```
# Procfile (root of project)
web: node .next/standalone/server.js
worker: npx ts-node --project tsconfig.json src/worker/index.ts
```

In Railway: configure two services from the same repo — or use a single service with a `Procfile` defining both processes via a process manager.

### Architecture Completeness Checklist

**Requirements Analysis**
- [x] Project context thoroughly analyzed
- [x] Scale and complexity assessed (medium-high, tens to low hundreds users)
- [x] Technical constraints identified (NBA stats API gate, FCM, PWA)
- [x] Cross-cutting concerns mapped (7 identified)

**Architectural Decisions**
- [x] Critical decisions documented (auth, DB, jobs, real-time)
- [x] Technology stack fully specified (T3 + pg-boss + Railway + shadcn/ui)
- [x] Integration patterns defined (nba-stats.ts and fcm.ts abstractions)
- [x] Performance considerations addressed (polling intervals, persistent server)

**Implementation Patterns**
- [x] Naming conventions established (DB, tRPC, jobs, components, files)
- [x] Structure patterns defined (service layer, worker separation)
- [x] Communication patterns specified (polling intervals, job payloads)
- [x] Process patterns documented (error handling, loading states, RBAC)
- [x] Anti-patterns documented with examples

**Project Structure**
- [x] Complete directory structure defined (every file named and annotated)
- [x] Component boundaries established (ui/, feature/, shared/)
- [x] Integration points mapped (3 data flow sequences documented)
- [x] Requirements to structure mapping complete (all 44 FRs mapped)

### Architecture Readiness Assessment

**Overall Status:** READY FOR IMPLEMENTATION

**Confidence Level:** High

**Key Strengths:**
- T3 Stack eliminates dozens of boilerplate decisions for a solo developer
- pg-boss reuses existing PostgreSQL — zero additional infrastructure
- Service abstraction layer (nba-stats.ts, fcm.ts) isolates the two highest-risk external dependencies; provider swap requires one file change
- Prisma transaction + unique constraint pattern directly addresses the race condition NFR
- Every FR is mapped to a specific file — implementation stories can reference architecture directly

**Areas for Future Enhancement (Post-MVP):**
- WebSocket upgrade for sub-second draft feed (polling sufficient for MVP)
- External APM/monitoring service (Railway logs sufficient for MVP)
- Staging environment (local + prod sufficient for MVP solo development)
- Native app (contingent on PWA proving the experience — Phase 3)

### Implementation Handoff

**AI Agent Guidelines:**
- Follow all architectural decisions exactly as documented
- Use `@ducanh2912/next-pwa` — not `next-pwa`
- Wrap pick submission in Prisma `$transaction` with unique constraint
- Place all external service calls in `src/server/services/` only
- Use `TRPCError` — never return error objects from procedures
- Refer to this document for all architectural questions before making independent decisions

**First Implementation Priority:**
```bash
npx create-t3-app@latest fantasy-finals \
  --nextAuth \
  --prisma \
  --tailwind \
  --trpc \
  --appRouter \
  --noGit
```
