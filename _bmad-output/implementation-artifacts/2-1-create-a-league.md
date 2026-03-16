# Story 2.1: Create a League

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a commissioner,
I want to create a league scoped to a specific NBA playoff series,
so that my friend group has a place to play.

## Acceptance Criteria

1. **Given** I am authenticated, **when** I fill out the league creation form (league name, series selection, selection clock duration), **then** a new league is created, I am automatically added as both commissioner and first participant, my global User role is updated to `commissioner`, and I am redirected to the league home page at `/league/[leagueId]`.

2. **Given** I am on the league creation form, **when** I select the playoff series, **then** a list of available series is shown (stubbed from `SERIES_STUBS` constant in `src/lib/constants.ts` — real NBA API data added in Story 3.1).

3. **Given** a league exists, **when** a non-member makes a tRPC call to `league.getLeague` with that leagueId, **then** a `FORBIDDEN` TRPCError is returned — enforced at the API layer, not the UI layer.

4. **Given** Vitest is configured, **when** `pnpm test` is run, **then** the tRPC `league.createLeague` and `league.getLeague` procedures are covered by integration tests that use a real database connection.

## Tasks / Subtasks

- [x] Task 1: Install Vitest and configure test infrastructure (AC: #4)
  - [x] Run `pnpm add -D vitest @vitest/coverage-v8 vite-tsconfig-paths`
  - [x] Create `vitest.config.ts` — node environment, tsconfigPaths, test pattern (see Dev Notes)
  - [x] Create `src/test/helpers.ts` — exports `makeCtx()` helper for constructing tRPC test context with mocked session
  - [x] Add `"test": "vitest run"` and `"test:watch": "vitest"` scripts to `package.json`
  - [x] Run `pnpm test` — confirm vitest runs (no tests yet, should exit 0)

- [x] Task 2: Add Prisma models — League and Participant (AC: #1, #3)
  - [x] Add `League` model to `prisma/schema.prisma` (see Dev Notes for exact schema)
  - [x] Add `Participant` model to `prisma/schema.prisma` (see Dev Notes for exact schema)
  - [x] Add relations to existing `User` model: `createdLeagues League[] @relation("LeagueCreator")` and `participations Participant[]`
  - [x] Run `pnpm prisma db push` to apply schema to Railway DB
  - [x] Run `pnpm prisma generate` to regenerate Prisma client
  - [x] Run `pnpm typecheck` — zero errors

- [x] Task 3: Add series stubs to `src/lib/constants.ts` (AC: #2)
  - [x] Add `SERIES_STUBS` array to existing constants.ts (see Dev Notes for format)
  - [x] Add `CLOCK_DURATION_OPTIONS` array: `[15, 30, 45, 60]` (minutes)
  - [x] Run `pnpm typecheck` — zero errors

- [x] Task 4: Create `src/server/api/routers/league.ts` (AC: #1, #3)
  - [x] `createLeague` — `protectedProcedure`, input: `{ name, seriesId, clockDurationMinutes }` (see Dev Notes)
  - [x] `getLeague` — `protectedProcedure`, input: `{ leagueId }`, enforces member-only access (see Dev Notes)
  - [x] Run `pnpm typecheck` — zero errors

- [x] Task 5: Register league router in `src/server/api/root.ts` (AC: #1)
  - [x] Import `leagueRouter` and add `league: leagueRouter` to `appRouter`
  - [x] Run `pnpm typecheck` — zero errors

- [x] Task 6: Clean up — remove `commissionerOnly` smoke test from `src/server/api/routers/post.ts` (retro debt)
  - [x] Remove the `commissionerOnly: commissionerProcedure.query(...)` entry from `postRouter`
  - [x] Remove `commissionerProcedure` import if now unused in post.ts
  - [x] Run `pnpm typecheck` — zero errors

- [x] Task 7: Install shadcn/ui form components (AC: #1, #2)
  - [x] Run `npx shadcn@latest add button input label select card`
  - [x] Confirm components appear in `src/components/ui/`
  - [x] Run `pnpm typecheck` — zero errors

- [x] Task 8: Create `src/components/league/CreateLeagueForm.tsx` (AC: #1, #2)
  - [x] `"use client"` — uses `useRouter` for redirect after creation
  - [x] Form fields: league name (text input), series (select from SERIES_STUBS), clock duration (select from CLOCK_DURATION_OPTIONS)
  - [x] On submit: call `api.league.createLeague.useMutation()`, on success redirect to `/league/${leagueId}`
  - [x] Loading state: submit button shows "Creating…" and is disabled
  - [x] Error state: inline error message below form (see Dev Notes for UX pattern)
  - [x] Dark theme: all inputs `bg-zinc-800 border-zinc-700 text-white`, card `bg-zinc-900`
  - [x] Primary button: `bg-orange-500 hover:bg-orange-600 text-white`, full-width, min 44px height
  - [x] Run `pnpm typecheck` — zero errors

- [x] Task 9: Create league creation page `src/app/league/new/page.tsx` (AC: #1)
  - [x] Server Component — calls `auth()` to verify session (middleware handles redirect if unauthed)
  - [x] Renders `<CreateLeagueForm />` with page title "Create a League"
  - [x] Dark theme consistent with rest of app: `min-h-screen bg-zinc-950 pb-16 text-zinc-50`
  - [x] Includes `<BottomNav />`
  - [x] Run `pnpm typecheck` — zero errors

- [x] Task 10: Create league home page `src/app/league/[leagueId]/page.tsx` (AC: #1, #3)
  - [x] Server Component — fetches league data via tRPC server-side caller
  - [x] Displays: league name, series name (looked up from SERIES_STUBS), participants list with commissioner badge, selection clock duration
  - [x] If non-member calls `league.getLeague` — tRPC throws FORBIDDEN, page renders 403 state (see Dev Notes)
  - [x] Includes `<BottomNav />`
  - [x] Run `pnpm typecheck` — zero errors

- [x] Task 11: Update `src/app/dashboard/page.tsx` — add league creation CTA (AC: #1)
  - [x] Add a "Create League" button/link below the existing skeleton section
  - [x] `<Link href="/league/new">` styled as primary orange button
  - [x] Replace existing skeleton placeholders with a real empty-state message: "No leagues yet — create one to get started"
  - [x] Run `pnpm typecheck` — zero errors

- [x] Task 12: Write Vitest integration tests for league procedures (AC: #4)
  - [x] Create `src/server/api/routers/league.test.ts`
  - [x] Test: `createLeague` — happy path creates league + participant + updates user role
  - [x] Test: `createLeague` — unauthenticated caller throws UNAUTHORIZED
  - [x] Test: `getLeague` — member can read their league
  - [x] Test: `getLeague` — non-member receives FORBIDDEN
  - [x] Clean up test data in `afterEach` (see Dev Notes for pattern)
  - [x] Run `pnpm test` — all tests pass

- [x] Task 13: Run `pnpm lint` and `pnpm typecheck` — zero errors (AC: all)
  - [x] `pnpm typecheck` — 0 errors ✅
  - [x] `SKIP_ENV_VALIDATION=true pnpm lint` — 0 errors ✅

## Dev Notes

### Vitest Configuration

This project uses ESM (`"type": "module"` in package.json) with TypeScript path aliases (`~/` → `src/`). Vitest config:

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    globals: false, // use explicit imports: import { it, expect, describe } from "vitest"
  },
});
```

**Install only what's needed for server-side procedure testing — no jsdom, no @testing-library:**
```bash
pnpm add -D vitest @vitest/coverage-v8 vite-tsconfig-paths
```

**package.json scripts to add:**
```json
"test": "vitest run",
"test:watch": "vitest"
```

### Test Helper — makeCtx and Test Caller Pattern

tRPC procedures are tested by calling them directly via `createCaller`, bypassing HTTP. Context must be constructed manually:

```ts
// src/test/helpers.ts
import { db } from "~/server/db";
import { type Session } from "next-auth";

// Creates a fake session for test contexts
export function makeSession(overrides?: Partial<Session["user"]>): Session {
  return {
    user: {
      id: overrides?.id ?? "test-user-id",
      email: overrides?.email ?? "test@example.com",
      name: overrides?.name ?? "Test User",
      role: overrides?.role ?? "participant",
    },
    expires: new Date(Date.now() + 86_400_000).toISOString(),
  };
}

export { db };
```

**Using the test caller in tests:**
```ts
// src/server/api/routers/league.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { createCaller } from "~/server/api/root";
import { db, makeSession } from "~/test/helpers";

// createCaller takes a context object directly
function makeCaller(session = makeSession()) {
  return createCaller({ db, session, headers: new Headers() });
}

function makeAnonCaller() {
  return createCaller({ db, session: null, headers: new Headers() });
}
```

**Important:** `createCaller` is already exported from `src/server/api/root.ts` (added in Story 1.5 for the notification router). No changes needed to root.ts for testing.

**Test isolation — clean up in afterEach:**
```ts
afterEach(async () => {
  // Delete in reverse dependency order
  await db.participant.deleteMany({ where: { userId: { startsWith: "test-" } } });
  await db.league.deleteMany({ where: { createdById: { startsWith: "test-" } } });
  await db.user.deleteMany({ where: { id: { startsWith: "test-" } } });
});
```

Create test users in DB directly before calling procedures that need real User records:
```ts
it("creates league successfully", async () => {
  // Arrange: ensure test user exists in DB
  await db.user.upsert({
    where: { id: "test-user-id" },
    create: { id: "test-user-id", email: "test@example.com", role: "participant" },
    update: {},
  });

  const caller = makeCaller();
  const result = await caller.league.createLeague({
    name: "Test League",
    seriesId: "2025-wc1-lakers-warriors",
    clockDurationMinutes: 30,
  });

  expect(result.leagueId).toBeTruthy();
  const league = await db.league.findUnique({ where: { id: result.leagueId } });
  expect(league?.name).toBe("Test League");
  const participant = await db.participant.findFirst({ where: { leagueId: result.leagueId } });
  expect(participant?.isCommissioner).toBe(true);
});
```

### Critical: Prisma Import Path

Always import from `"generated/prisma"` — NOT `"@prisma/client"`:
```ts
import { type UserRole } from "generated/prisma"; // ✅
import { type UserRole } from "@prisma/client";    // ❌ does not exist in this project
```

### Prisma Schema — League and Participant Models

Add to `prisma/schema.prisma` (after existing models):

```prisma
model League {
  id                   String        @id @default(cuid())
  name                 String
  seriesId             String        @map("series_id")
  clockDurationMinutes Int           @map("clock_duration_minutes")
  createdById          String        @map("created_by_id")
  createdAt            DateTime      @default(now()) @map("created_at")
  updatedAt            DateTime      @updatedAt @map("updated_at")

  createdBy    User          @relation("LeagueCreator", fields: [createdById], references: [id])
  participants Participant[]

  @@map("leagues")
}

model Participant {
  id             String   @id @default(cuid())
  userId         String   @map("user_id")
  leagueId       String   @map("league_id")
  isCommissioner Boolean  @default(false) @map("is_commissioner")
  joinedAt       DateTime @default(now()) @map("joined_at")

  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  league League @relation(fields: [leagueId], references: [id], onDelete: Cascade)

  @@unique([userId, leagueId])
  @@map("participants")
}
```

Add to existing `User` model (after `pushSubscriptions PushSubscription[]`):
```prisma
  createdLeagues  League[]      @relation("LeagueCreator")
  participations  Participant[]
```

Run after schema changes:
```bash
pnpm prisma db push    # applies to Railway DB (now on internal URL)
pnpm prisma generate   # regenerates Prisma client
```

### Series Stubs in constants.ts

Add to existing `src/lib/constants.ts`:

```ts
// Stubbed series list — real NBA API integration in Story 3.1
export const SERIES_STUBS = [
  { id: "2025-wc1-okc-memphis", name: "OKC Thunder vs Memphis Grizzlies — West R1" },
  { id: "2025-wc2-lakers-warriors", name: "Lakers vs Warriors — West R1" },
  { id: "2025-ec1-celtics-heat", name: "Celtics vs Heat — East R1" },
  { id: "2025-ec2-knicks-sixers", name: "Knicks vs 76ers — East R1" },
] as const;

export type SeriesId = (typeof SERIES_STUBS)[number]["id"];

// Clock duration options (minutes) — up to MAX_CLOCK_MINUTES
export const CLOCK_DURATION_OPTIONS = [15, 30, 45, 60] as const;
export type ClockDurationMinutes = (typeof CLOCK_DURATION_OPTIONS)[number];
```

Note: `MAX_CLOCK_MINUTES = 60` is already in constants.ts from Story 1.1.

### league.ts — Full Implementation

```ts
// src/server/api/routers/league.ts
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { CLOCK_DURATION_OPTIONS, SERIES_STUBS } from "~/lib/constants";

const seriesIds = SERIES_STUBS.map((s) => s.id) as [string, ...string[]];
const clockOptions = CLOCK_DURATION_OPTIONS as unknown as [number, ...number[]];

export const leagueRouter = createTRPCRouter({
  createLeague: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(60),
        seriesId: z.enum(seriesIds),
        clockDurationMinutes: z.number().int().min(1).max(60),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const league = await ctx.db.league.create({
        data: {
          name: input.name,
          seriesId: input.seriesId,
          clockDurationMinutes: input.clockDurationMinutes,
          createdById: userId,
          participants: {
            create: {
              userId,
              isCommissioner: true,
            },
          },
        },
      });

      // Promote user to commissioner role if currently participant
      // Note: JWT role is stale until next sign-in — acceptable for MVP
      if (ctx.session.user.role === "participant") {
        await ctx.db.user.update({
          where: { id: userId },
          data: { role: "commissioner" },
        });
      }

      return { leagueId: league.id };
    }),

  getLeague: protectedProcedure
    .input(z.object({ leagueId: z.string() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const isAdmin = ctx.session.user.role === "admin";

      // Admins bypass member check (FR5)
      if (!isAdmin) {
        const membership = await ctx.db.participant.findUnique({
          where: { userId_leagueId: { userId, leagueId: input.leagueId } },
        });
        if (!membership) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Not a member of this league" });
        }
      }

      const league = await ctx.db.league.findUnique({
        where: { id: input.leagueId },
        include: {
          participants: {
            include: { user: { select: { id: true, name: true, email: true } } },
            orderBy: { joinedAt: "asc" },
          },
        },
      });

      if (!league) {
        throw new TRPCError({ code: "NOT_FOUND", message: "League not found" });
      }

      return league;
    }),
});
```

**Important Prisma compound unique index syntax:** `@@unique([userId, leagueId])` in schema maps to `userId_leagueId` as the Prisma findUnique where key — e.g., `{ userId_leagueId: { userId, leagueId } }`.

### JWT Role Staleness — Known Limitation

When `createLeague` promotes the User's `role` to `commissioner` in the DB, the current session JWT still reflects `participant` (set at sign-in time via `jwt` callback in Story 1.3). The in-session `ctx.session.user.role` will be stale until the user re-signs-in.

**Impact on Story 2.1:** None — `createLeague` uses `protectedProcedure` (no role check). The commissioner role in JWT is not needed until a `commissionerProcedure` is called in a future story.

**Future fix (not in scope for 2.1):** In a later story, add a `getSession()` client-side refresh after league creation, or use a tRPC context that re-reads role from DB on each request. For MVP, the DB update is sufficient — it ensures correctness on next sign-in.

### CreateLeagueForm — Full Implementation

```tsx
// src/components/league/CreateLeagueForm.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { api } from "~/trpc/react";
import { SERIES_STUBS, CLOCK_DURATION_OPTIONS } from "~/lib/constants";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";

export function CreateLeagueForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [seriesId, setSeriesId] = useState("");
  const [clockDurationMinutes, setClockDurationMinutes] = useState<number>(30);
  const [error, setError] = useState<string | null>(null);

  const createLeague = api.league.createLeague.useMutation({
    onSuccess: ({ leagueId }) => {
      router.push(`/league/${leagueId}`);
    },
    onError: (err) => {
      setError(err.message ?? "Failed to create league. Please try again.");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!seriesId) {
      setError("Please select a playoff series.");
      return;
    }
    createLeague.mutate({ name, seriesId, clockDurationMinutes });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="league-name" className="text-zinc-300">
          League Name
        </Label>
        <Input
          id="league-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My League"
          required
          maxLength={60}
          className="border-zinc-700 bg-zinc-800 text-white placeholder:text-zinc-500"
        />
      </div>

      <div className="space-y-2">
        <Label className="text-zinc-300">Playoff Series</Label>
        <Select onValueChange={setSeriesId} value={seriesId}>
          <SelectTrigger className="border-zinc-700 bg-zinc-800 text-white">
            <SelectValue placeholder="Select a series" />
          </SelectTrigger>
          <SelectContent className="border-zinc-700 bg-zinc-900">
            {SERIES_STUBS.map((series) => (
              <SelectItem
                key={series.id}
                value={series.id}
                className="text-zinc-100 focus:bg-zinc-700"
              >
                {series.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label className="text-zinc-300">Selection Clock</Label>
        <Select
          onValueChange={(v) => setClockDurationMinutes(Number(v))}
          value={String(clockDurationMinutes)}
        >
          <SelectTrigger className="border-zinc-700 bg-zinc-800 text-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="border-zinc-700 bg-zinc-900">
            {CLOCK_DURATION_OPTIONS.map((minutes) => (
              <SelectItem
                key={minutes}
                value={String(minutes)}
                className="text-zinc-100 focus:bg-zinc-700"
              >
                {minutes} minutes
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <Button
        type="submit"
        disabled={createLeague.isPending}
        className="w-full bg-orange-500 py-3 font-bold text-white hover:bg-orange-600 disabled:opacity-50"
      >
        {createLeague.isPending ? "Creating…" : "Create League"}
      </Button>
    </form>
  );
}
```

### League Home Page — Server-Side Data Fetching

```tsx
// src/app/league/[leagueId]/page.tsx
import { notFound, redirect } from "next/navigation";
import { TRPCError } from "@trpc/server";

import { auth } from "~/server/auth";
import { createCaller } from "~/server/api/root";
import { db } from "~/server/db";
import { SERIES_STUBS } from "~/lib/constants";
import { BottomNav } from "~/components/shared/BottomNav";

interface Props {
  params: Promise<{ leagueId: string }>;
}

export default async function LeagueHomePage({ params }: Props) {
  const { leagueId } = await params;
  const session = await auth();
  if (!session) redirect("/sign-in");

  const caller = createCaller({ db, session, headers: new Headers() });

  let league;
  try {
    league = await caller.league.getLeague({ leagueId });
  } catch (err) {
    if (err instanceof TRPCError && err.code === "FORBIDDEN") {
      return (
        <main className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-50">
          <p className="text-zinc-400">You are not a member of this league.</p>
        </main>
      );
    }
    notFound();
  }

  const series = SERIES_STUBS.find((s) => s.id === league.seriesId);

  return (
    <main className="min-h-screen bg-zinc-950 pb-16 text-zinc-50">
      <div className="mx-auto max-w-xl px-4 py-6">
        <h1 className="mb-1 text-2xl font-bold text-orange-500">{league.name}</h1>
        <p className="mb-4 text-sm text-zinc-400">{series?.name ?? league.seriesId}</p>
        <p className="mb-6 text-sm text-zinc-400">
          Selection clock: {league.clockDurationMinutes} min
        </p>

        <h2 className="mb-3 text-lg font-semibold text-zinc-100">Participants</h2>
        <ul className="space-y-2">
          {league.participants.map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-3 rounded-xl bg-zinc-900 px-4 py-3"
            >
              <span className="text-zinc-100">{p.user.name ?? p.user.email}</span>
              {p.isCommissioner && (
                <span className="rounded-full bg-orange-500/20 px-2 py-0.5 text-xs font-medium text-orange-400">
                  Commissioner
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
      <BottomNav />
    </main>
  );
}
```

### Handling Next.js 15 Async Params

In Next.js 15, `params` in page components is now a `Promise`. Always `await params`:
```ts
// ✅ Next.js 15 pattern
export default async function Page({ params }: { params: Promise<{ leagueId: string }> }) {
  const { leagueId } = await params;
  // ...
}

// ❌ Old pattern (Next.js 14) — will cause TypeScript error in Next.js 15
export default async function Page({ params }: { params: { leagueId: string } }) {
  const { leagueId } = params; // error: params is now Promise
}
```

### Dashboard Update — Empty State + CTA

```tsx
// src/app/dashboard/page.tsx — replace skeleton section
import Link from "next/link";
// ... existing imports ...

export default async function DashboardPage() {
  const session = await auth();

  return (
    <main className="min-h-screen bg-zinc-950 pb-16 text-zinc-50">
      <div className="mx-auto max-w-xl px-4 py-6">
        <h1 className="mb-1 text-2xl font-bold text-orange-500">Fantasy Finals</h1>
        <p className="mb-6 text-sm text-zinc-400">{session?.user?.email}</p>

        {/* League list — populated in Story 2.5; empty state for now */}
        <div className="flex flex-col items-center gap-4 py-12 text-center">
          <p className="text-zinc-400">No leagues yet — create one to get started.</p>
          <Link
            href="/league/new"
            className="rounded-xl bg-orange-500 px-6 py-3 text-sm font-bold text-white hover:bg-orange-600"
          >
            Create League
          </Link>
        </div>

        <PushPermissionPrompt />
      </div>
      <BottomNav />
    </main>
  );
}
```

Note: Remove the `<Skeleton />` components and `import { Skeleton }` from dashboard — they were Story 1.4 demos, no longer needed now that real content exists.

### server-only Import Pattern for createCaller in Server Components

When calling tRPC procedures in Server Components (page.tsx), use `createCaller` with the db + session context directly — NOT `api.league.getLeague()` (that's the React client):

```ts
// ✅ Server Component pattern (page.tsx)
import { createCaller } from "~/server/api/root";
import { db } from "~/server/db";

const caller = createCaller({ db, session, headers: new Headers() });
const league = await caller.league.getLeague({ leagueId });

// ❌ React client pattern — only works in "use client" components
import { api } from "~/trpc/react";
const { data } = api.league.getLeague.useQuery({ leagueId }); // React hooks only
```

### Architecture Anti-Patterns to Avoid

- ❌ Do NOT import `@prisma/client` — always `"generated/prisma"`
- ❌ Do NOT return error objects from tRPC procedures — always `throw new TRPCError(...)`
- ❌ Do NOT check membership in a React component — enforce at tRPC procedure level
- ❌ Do NOT use `params.leagueId` directly in Next.js 15 — always `await params` first
- ❌ Do NOT use `api.league.*` hooks in Server Components — only in `"use client"` components
- ❌ Do NOT import `~/env.js` in test files — tests use `process.env.DATABASE_URL` via the db singleton
- ❌ Do NOT install `ts-node` — this project uses `tsx` for all TypeScript execution
- ❌ Do NOT modify files in `src/components/ui/` — shadcn/ui only; customize via CSS variables

### Previous Story Learnings (Epic 1)

- **Prisma import**: `from "generated/prisma"` — never `@prisma/client`
- **pnpm prisma db push + generate**: Both required after schema changes
- **JWT strategy**: `ctx.session` is from JWT token, not DB lookup on every request
- **`tsx` not `ts-node`**: ESM project; worker uses tsx throughout
- **tRPC error pattern**: Always `throw new TRPCError(...)`, never return `{ error: ... }`
- **Next.js 15 async params**: `params` is a Promise — must be awaited
- **Railway internal URL**: DATABASE_URL now uses internal Railway URL (faster)
- **Vitest with ESM**: Use `vite-tsconfig-paths` to resolve `~/` aliases; keep environment `"node"` for server-side tests
- **Code review catches real issues**: Run lint + typecheck before marking done

### Known Platform Issues (Railway/Next.js)

- **Railway DB URL**: Now correctly set to internal URL (`${{Postgres.DATABASE_URL}}`). If tests fail with connection refused, check that your local `.env` uses the **public proxy URL** (`DATABASE_PUBLIC_URL`) — the internal URL only works within Railway's private network.
- **`pnpm prisma db push` vs `prisma migrate dev`**: This project uses `db push` for schema changes in development — not `migrate dev`. Do NOT run `migrate dev`.

### Project Structure Notes

**New files:**
- `vitest.config.ts` *(new — Vitest configuration)*
- `src/test/helpers.ts` *(new — makeSession + db export for tests)*
- `src/lib/constants.ts` *(modified — SERIES_STUBS + CLOCK_DURATION_OPTIONS added)*
- `src/server/api/routers/league.ts` *(new — createLeague + getLeague)*
- `src/server/api/routers/league.test.ts` *(new — integration tests)*
- `src/components/league/CreateLeagueForm.tsx` *(new)*
- `src/app/league/new/page.tsx` *(new — creation form page)*
- `src/app/league/[leagueId]/page.tsx` *(new — league home)*
- `prisma/schema.prisma` *(modified — League + Participant models + User relations)*

**Modified files:**
- `src/server/api/root.ts` *(add league: leagueRouter)*
- `src/server/api/routers/post.ts` *(remove commissionerOnly smoke test)*
- `src/app/dashboard/page.tsx` *(replace skeletons with empty state + CTA)*
- `package.json` *(vitest devDeps + test scripts)*

### References

- League router location: [Source: architecture.md#Complete Project Directory Structure — routers/league.ts]
- `CreateLeagueForm.tsx` component: [Source: architecture.md#Complete Project Directory Structure — components/league/]
- League route structure: [Source: architecture.md#Complete Project Directory Structure — app/(auth)/league/[leagueId]/]
- Prisma naming conventions (cuid, camelCase, @map): [Source: architecture.md#Naming Patterns — Database Naming Conventions]
- `throw TRPCError` never return error objects: [Source: architecture.md#Format Patterns — Error Response Structure]
- RBAC at API layer never UI: [Source: architecture.md#Process Patterns — RBAC Enforcement]
- Selection clock up to 60 min: [Source: epics.md#FR13]
- Mobile-first, 44px tap targets: [Source: ux-design-specification.md#Spacing & Layout Foundation]
- Primary button: full-width, orange-500: [Source: ux-design-specification.md#Button Hierarchy]
- Inline error below form: [Source: ux-design-specification.md#Feedback Patterns — Error]
- `max-w-xl mx-auto` on main content: [Source: ux-design-specification.md#Responsive Strategy]
- Dashboard empty state with CTA: [Source: ux-design-specification.md#Empty States]
- Vitest + vite-tsconfig-paths pattern: [Source: nextjs.org/docs/app/guides/testing/vitest]
- Test isolation with afterEach cleanup: [Source: prisma.io/docs/testing/integration-testing]

## Senior Developer Review (AI)

**Review Date:** 2026-03-14
**Reviewer Model:** claude-opus-4-6
**Review Outcome:** Approve (after fixes)

**Findings:** 2 High, 4 Medium, 2 Low

### Action Items

- [x] [HIGH] `createLeague` writes not wrapped in `$transaction()` — league+participant creation and user role promotion are separate queries; partial failure leaves inconsistent state → Fixed: wrapped in `db.$transaction()`
- [x] [HIGH] UNAUTHORIZED test calls mutation twice (redundant `rejects.toThrow` + manual try/catch) → Fixed: kept only try/catch with code assertion
- [x] [MED] `league/new/page.tsx` missing `auth()` call — story spec required Server Component with session check → Fixed: added `auth()` + redirect
- [x] [MED] `clockDurationMinutes` accepts any 1-60, not constrained to `CLOCK_DURATION_OPTIONS` → Fixed: `z.number().int().refine()` against `CLOCK_DURATION_OPTIONS` set
- [x] [MED] Test user setup duplicated in 3 tests → Fixed: moved to `beforeEach`, `update: { role: "participant" }` resets state
- [x] [MED] `getLeague` exposes email of all participants → Accepted: intentional — UI uses `name ?? email` fallback for display
- [ ] [LOW] Vitest warns about deprecated `vite-tsconfig-paths` plugin → Deferred: switch to native `resolve.tsconfigPaths` when convenient
- [ ] [LOW] `pnpm-lock.yaml` and `generated/prisma/` not in story File List → Noted for completeness

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Vitest 4.x + next-auth ESM resolution: `next-auth/lib/env.js` imports `next/server` without `.js` extension, causing `Cannot find module` in Vitest. Fixed by adding `server.deps.inline: [/next-auth/, /^next$/]` to `vitest.config.ts` — forces Vite to transform these packages rather than loading them as external Node.js modules.

### Completion Notes List

- All 13 tasks completed. 4 integration tests pass (createLeague happy path, UNAUTHORIZED, getLeague member access, getLeague FORBIDDEN).
- Vitest infrastructure established: `vitest.config.ts`, `src/test/helpers.ts`, real DB integration tests with afterEach cleanup.
- League + Participant Prisma models deployed to Railway DB via `db push`. User model extended with `createdLeagues` and `participations` relations.
- `SERIES_STUBS` + `CLOCK_DURATION_OPTIONS` + `SeriesId` + `ClockDurationMinutes` types added to `src/lib/constants.ts`.
- `leagueRouter` (createLeague + getLeague) created and registered in appRouter.
- Epic 1 retro debt cleared: `commissionerOnly` smoke test removed from `post.ts`.
- shadcn/ui components added: button, input, label, select, card (added `radix-ui` as peer dependency).
- `CreateLeagueForm` client component: dark theme, series/clock selects, loading/error states, onSuccess redirect to `/league/[leagueId]`.
- `/league/new` page: server component wrapping CreateLeagueForm with BottomNav.
- `/league/[leagueId]` page: server component fetching via createCaller, FORBIDDEN → member-error state, NOT_FOUND → notFound().
- Dashboard updated: skeleton placeholders replaced with empty state + "Create League" CTA link.

### File List

- `vitest.config.ts` (new)
- `src/test/helpers.ts` (new)
- `src/server/api/routers/league.ts` (new)
- `src/server/api/routers/league.test.ts` (new)
- `src/components/league/CreateLeagueForm.tsx` (new)
- `src/app/league/new/page.tsx` (new)
- `src/app/league/[leagueId]/page.tsx` (new)
- `src/components/ui/button.tsx` (new — shadcn/ui)
- `src/components/ui/input.tsx` (new — shadcn/ui)
- `src/components/ui/label.tsx` (new — shadcn/ui)
- `src/components/ui/select.tsx` (new — shadcn/ui)
- `src/components/ui/card.tsx` (new — shadcn/ui)
- `prisma/schema.prisma` (modified — League + Participant models, User relations)
- `src/lib/constants.ts` (modified — SERIES_STUBS, CLOCK_DURATION_OPTIONS, SeriesId, ClockDurationMinutes)
- `src/server/api/root.ts` (modified — league: leagueRouter registered)
- `src/server/api/routers/post.ts` (modified — commissionerOnly smoke test removed)
- `src/app/dashboard/page.tsx` (modified — skeleton → empty state + CTA)
- `package.json` (modified — vitest + vite-tsconfig-paths devDeps, test scripts, radix-ui dep)

## Change Log

- 2026-03-14: Story 2.1 implemented — Vitest setup, League+Participant Prisma models, leagueRouter (createLeague+getLeague), CreateLeagueForm, /league/new, /league/[leagueId], dashboard CTA, 4 integration tests passing. commissionerOnly smoke test removed (Epic 1 retro debt). shadcn/ui components installed. All ACs satisfied.
- 2026-03-14: Code review (claude-opus-4-6) — 6 issues fixed: $transaction for createLeague atomicity, clock validation constrained to CLOCK_DURATION_OPTIONS, auth() added to /league/new, duplicate test assertion removed, test setup DRYed into beforeEach. Email exposure in getLeague accepted as intentional design.
