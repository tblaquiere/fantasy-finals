# Story 2.3: Join a League via Invite Link

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to join a league by clicking an invite link,
so that I can start participating without the commissioner adding me manually.

## Acceptance Criteria

1. **Given** I click a valid invite link while unauthenticated, **when** I complete sign-in (magic link or Google OAuth), **then** I am automatically added to the league as a participant **and** I am redirected to the league home page with context about what the league is.

2. **Given** I click a valid invite link while already authenticated, **when** the join page loads, **then** I am added to the league immediately **and** redirected to the league home with my participant status shown.

3. **Given** I am already a member of a league, **when** I click the same invite link again, **then** I am redirected to the league home without being added twice.

4. **Given** someone clicks an invalid or revoked invite link, **when** the join page loads, **then** they see a clear error message ("This invite link is invalid or has expired").

## Tasks / Subtasks

- [x] Task 1: Add `getLeagueByToken` public procedure to league router (AC: #1, #4)
  - [x] Add `getLeagueByToken` — `publicProcedure`, input: `{ token: z.string() }`, returns public league info (id, name, seriesId, participant count) without requiring auth
  - [x] Token lookup via `db.league.findUnique({ where: { inviteToken: token } })`
  - [x] Return `null` if token not found (do NOT throw — page handles the null case)
  - [x] Run `pnpm typecheck` — zero errors

- [x] Task 2: Add `joinLeague` protected procedure to league router (AC: #1, #2, #3)
  - [x] Add `joinLeague` — `protectedProcedure`, input: `{ token: z.string() }`, looks up league by `inviteToken`, creates `Participant` record with `isCommissioner: false`
  - [x] Handle "already a member" gracefully: catch Prisma unique constraint violation (`P2002` on `userId_leagueId`) and return `{ leagueId, alreadyMember: true }` instead of throwing
  - [x] If token is invalid (no league found), throw `TRPCError({ code: "NOT_FOUND", message: "Invalid or expired invite link" })`
  - [x] Return `{ leagueId: league.id, alreadyMember: false }` on success
  - [x] Run `pnpm typecheck` — zero errors

- [x] Task 3: Update middleware to allow unauthenticated access to `/join/*` (AC: #1)
  - [x] In `src/middleware.ts`, update the matcher regex to exclude `join` routes
  - [x] Current matcher: `"/((?!sign-in|api/auth|api/firebase-messaging-sw|_next/static|_next/image|favicon\\.ico|manifest\\.json|icons).*)"`
  - [x] Updated matcher: `"/((?!sign-in|join|api/auth|api/firebase-messaging-sw|_next/static|_next/image|favicon\\.ico|manifest\\.json|icons).*)"`
  - [x] Run `pnpm typecheck` — zero errors

- [x] Task 4: Create `src/app/join/[token]/page.tsx` — join page (AC: #1, #2, #3, #4)
  - [x] Server Component — calls `auth()` to check session status
  - [x] Calls `caller.league.getLeagueByToken({ token })` (public — works without session)
  - [x] If token invalid (null result): render error state with "This invite link is invalid or has expired" message
  - [x] If authenticated: call `caller.league.joinLeague({ token })` server-side, then `redirect(`/league/${leagueId}`)` — covers AC #2 and AC #3
  - [x] If NOT authenticated: render league preview (name, series, participant count) with "Sign in to join" button that links to `/sign-in?callbackUrl=/join/${token}` — covers AC #1
  - [x] Dark theme consistent: `min-h-screen bg-zinc-950 text-zinc-50`
  - [x] Run `pnpm typecheck` — zero errors

- [x] Task 5: Write Vitest integration tests for new procedures (AC: all)
  - [x] Create `src/server/api/routers/league-join.test.ts`
  - [x] Test: `getLeagueByToken` — valid token returns league info (name, seriesId, participant count)
  - [x] Test: `getLeagueByToken` — invalid token returns null
  - [x] Test: `joinLeague` — authenticated user joins league successfully, Participant record created
  - [x] Test: `joinLeague` — user already a member returns `{ alreadyMember: true }` without error
  - [x] Test: `joinLeague` — invalid token throws NOT_FOUND
  - [x] Run `pnpm test` — all tests pass

- [x] Task 6: Run `pnpm lint` and `pnpm typecheck` — zero errors (AC: all)
  - [x] `pnpm typecheck` — 0 errors
  - [x] `SKIP_ENV_VALIDATION=true pnpm lint` — 0 errors

## Dev Notes

### Public Procedure for Token Lookup

The join page must be accessible without auth (UX spec: "league context screen, NOT a generic sign-in page"). Use `publicProcedure` for the token lookup:

```ts
getLeagueByToken: publicProcedure
  .input(z.object({ token: z.string() }))
  .query(async ({ ctx, input }) => {
    const league = await ctx.db.league.findUnique({
      where: { inviteToken: input.token },
      select: {
        id: true,
        name: true,
        seriesId: true,
        _count: { select: { participants: true } },
      },
    });

    if (!league) return null;

    return {
      id: league.id,
      name: league.name,
      seriesId: league.seriesId,
      participantCount: league._count.participants,
    };
  }),
```

`publicProcedure` is already defined in `src/server/api/trpc.ts` — import it alongside `protectedProcedure`.

### Join Procedure — Handle Duplicate Gracefully

```ts
joinLeague: protectedProcedure
  .input(z.object({ token: z.string() }))
  .mutation(async ({ ctx, input }) => {
    const league = await ctx.db.league.findUnique({
      where: { inviteToken: input.token },
      select: { id: true },
    });

    if (!league) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Invalid or expired invite link" });
    }

    try {
      await ctx.db.participant.create({
        data: {
          userId: ctx.session.user.id,
          leagueId: league.id,
          isCommissioner: false,
        },
      });
      return { leagueId: league.id, alreadyMember: false };
    } catch (err) {
      // Unique constraint violation on [userId, leagueId] — user already a member
      if (
        typeof err === "object" && err !== null && "code" in err && err.code === "P2002"
      ) {
        return { leagueId: league.id, alreadyMember: true };
      }
      throw err;
    }
  }),
```

**Key pattern:** Prisma unique constraint errors have `code: "P2002"`. Catch this specifically — do NOT throw on duplicate join, just return `alreadyMember: true` and let the page redirect to the league home. The `PrismaClientKnownRequestError` class is in `generated/prisma` — you can import and use `instanceof` if preferred, but checking `.code === "P2002"` works without the import.

### Middleware Update — Critical

The current middleware blocks ALL routes except a few exclusions. `/join/[token]` MUST be excluded so unauthenticated users can view the league preview:

```ts
// src/middleware.ts — update the matcher regex
export const config = {
  matcher: [
    "/((?!sign-in|join|api/auth|api/firebase-messaging-sw|_next/static|_next/image|favicon\\.ico|manifest\\.json|icons).*)",
  ],
};
```

Add `join|` right after `sign-in|` in the exclusion group. Without this change, unauthenticated users clicking an invite link will be redirected to `/sign-in` with no league context — breaking AC #1 and the UX spec.

### Join Page — Two-Phase Flow

```tsx
// src/app/join/[token]/page.tsx
import { redirect } from "next/navigation";
import { auth } from "~/server/auth";
import { createCaller } from "~/server/api/root";
import { db } from "~/server/db";
import { SERIES_STUBS } from "~/lib/constants";
import Link from "next/link";

interface Props {
  params: Promise<{ token: string }>;
}

export default async function JoinPage({ params }: Props) {
  const { token } = await params;

  // Phase 0: Look up league by token (public — no auth needed)
  const caller = createCaller({ db, session: null, headers: new Headers() });
  const league = await caller.league.getLeagueByToken({ token });

  // Invalid token
  if (!league) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-50">
        <div className="mx-auto max-w-sm px-4 text-center">
          <h1 className="mb-4 text-2xl font-bold text-orange-500">Invalid Invite Link</h1>
          <p className="text-zinc-400">This invite link is invalid or has expired. Ask the league commissioner for a new one.</p>
        </div>
      </main>
    );
  }

  // Phase 1: Check auth
  const session = await auth();

  if (session) {
    // Phase 2: Authenticated — join immediately and redirect
    const authedCaller = createCaller({ db, session, headers: new Headers() });
    const result = await authedCaller.league.joinLeague({ token });
    redirect(`/league/${result.leagueId}`);
  }

  // Not authenticated — show league preview with sign-in CTA
  const series = SERIES_STUBS.find((s) => s.id === league.seriesId);

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-50">
      <div className="mx-auto max-w-sm px-4 text-center">
        <h1 className="mb-2 text-2xl font-bold text-orange-500">{league.name}</h1>
        <p className="mb-1 text-sm text-zinc-400">{series?.name ?? league.seriesId}</p>
        <p className="mb-6 text-sm text-zinc-500">{league.participantCount} participant{league.participantCount !== 1 ? "s" : ""}</p>
        <p className="mb-6 text-zinc-300">You&apos;ve been invited to join this league!</p>
        <Link
          href={`/sign-in?callbackUrl=${encodeURIComponent(`/join/${token}`)}`}
          className="inline-block rounded-lg bg-orange-500 px-6 py-3 font-semibold text-white hover:bg-orange-600"
        >
          Sign in to join
        </Link>
      </div>
    </main>
  );
}
```

**Critical notes:**
- `createCaller({ db, session: null, headers: new Headers() })` — pass `session: null` for public procedure calls. This works because `publicProcedure` does not check session.
- After sign-in, NextAuth's `callbackUrl` redirects back to `/join/[token]` — the page then runs again, this time with a session, hits the `if (session)` branch, joins, and redirects to league home. This gives us the full flow: invite link → preview → sign-in → auto-join → league home.
- `await params` — required in Next.js 15, dynamic route params are a Promise.

### Auth Callback URL Flow

The sign-in page already supports `callbackUrl` via NextAuth's built-in behavior:
1. User clicks "Sign in to join" → navigates to `/sign-in?callbackUrl=/join/abc123`
2. User completes sign-in (magic link or Google OAuth)
3. NextAuth redirects to `callbackUrl` → `/join/abc123`
4. Join page runs again with active session → joins league → redirects to `/league/[leagueId]`

Verify that `src/app/sign-in/page.tsx` passes `callbackUrl` through to the NextAuth `signIn()` calls. If it reads `searchParams.callbackUrl` and passes it as the `callbackUrl` option, this flow works automatically.

### Test Pattern for Public Procedures

`publicProcedure` does not require a session. Create a caller with no session for `getLeagueByToken` tests:

```ts
function makePublicCaller() {
  return createCaller({ db, session: null, headers: new Headers() });
}
```

For `joinLeague` tests, use `makeCaller(makeSession())` as in previous test files — `joinLeague` uses `protectedProcedure`.

**Test file:** `src/server/api/routers/league-join.test.ts`

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TRPCError } from "@trpc/server";
import { createCaller } from "~/server/api/root";
import { db, makeSession } from "~/test/helpers";

function makePublicCaller() {
  return createCaller({ db, session: null, headers: new Headers() });
}

function makeCaller(session = makeSession()) {
  return createCaller({ db, session, headers: new Headers() });
}

let testLeagueId: string;
let testInviteToken: string;

beforeEach(async () => {
  // Create commissioner user
  await db.user.upsert({
    where: { id: "test-comm-id" },
    create: { id: "test-comm-id", email: "comm@example.com", role: "commissioner" },
    update: { role: "commissioner" },
  });
  // Create league with known invite token
  const league = await db.league.create({
    data: {
      name: "Join Test League",
      seriesId: "2025-wc1-okc-memphis",
      clockDurationMinutes: 30,
      inviteToken: "test-invite-token-abc",
      createdById: "test-comm-id",
      participants: { create: { userId: "test-comm-id", isCommissioner: true } },
    },
  });
  testLeagueId = league.id;
  testInviteToken = league.inviteToken!;

  // Create joiner user
  await db.user.upsert({
    where: { id: "test-joiner-id" },
    create: { id: "test-joiner-id", email: "joiner@example.com", role: "participant" },
    update: { role: "participant" },
  });
});

afterEach(async () => {
  await db.participant.deleteMany({ where: { userId: { startsWith: "test-" } } });
  await db.league.deleteMany({ where: { createdById: { startsWith: "test-" } } });
  await db.user.deleteMany({ where: { id: { startsWith: "test-" } } });
});

describe("league.getLeagueByToken", () => {
  it("returns league info for valid token", async () => {
    const caller = makePublicCaller();
    const result = await caller.league.getLeagueByToken({ token: testInviteToken });
    expect(result).not.toBeNull();
    expect(result!.name).toBe("Join Test League");
    expect(result!.participantCount).toBe(1); // commissioner
  });

  it("returns null for invalid token", async () => {
    const caller = makePublicCaller();
    const result = await caller.league.getLeagueByToken({ token: "nonexistent-token" });
    expect(result).toBeNull();
  });
});

describe("league.joinLeague", () => {
  it("joins league successfully", async () => {
    const caller = makeCaller(makeSession({ id: "test-joiner-id" }));
    const result = await caller.league.joinLeague({ token: testInviteToken });
    expect(result.leagueId).toBe(testLeagueId);
    expect(result.alreadyMember).toBe(false);

    // Verify participant record created
    const participant = await db.participant.findUnique({
      where: { userId_leagueId: { userId: "test-joiner-id", leagueId: testLeagueId } },
    });
    expect(participant).not.toBeNull();
    expect(participant!.isCommissioner).toBe(false);
  });

  it("returns alreadyMember for duplicate join", async () => {
    const caller = makeCaller(makeSession({ id: "test-joiner-id" }));
    // Join once
    await caller.league.joinLeague({ token: testInviteToken });
    // Join again — should not throw
    const result = await caller.league.joinLeague({ token: testInviteToken });
    expect(result.alreadyMember).toBe(true);
    expect(result.leagueId).toBe(testLeagueId);
  });

  it("throws NOT_FOUND for invalid token", async () => {
    const caller = makeCaller(makeSession({ id: "test-joiner-id" }));
    let caught: TRPCError | undefined;
    try {
      await caller.league.joinLeague({ token: "nonexistent-token" });
    } catch (e) {
      if (e instanceof TRPCError) caught = e;
    }
    expect(caught?.code).toBe("NOT_FOUND");
  });
});
```

### Architecture Anti-Patterns to Avoid

- Do NOT require auth for the league preview — the join page must show league context to unauthenticated users per UX spec
- Do NOT expose sensitive league data in `getLeagueByToken` — return only public info (name, series, participant count), NOT invite token or participant details
- Do NOT throw on duplicate join attempt — return `alreadyMember: true` and let the page redirect gracefully
- Do NOT use `params.token` directly — always `await params` first (Next.js 15)
- Do NOT import `@prisma/client` — always `"generated/prisma"`
- Do NOT create a separate API route for joining — keep it in the existing `leagueRouter`
- Do NOT forget to update the middleware matcher — without this, the entire join flow breaks for unauthenticated users

### Previous Story Learnings (from Stories 2.1 & 2.2)

- **`createCaller` with `session: null`**: Works for public procedures — pass `null` as session when no auth is needed
- **`commissionerProcedure` vs `protectedProcedure`**: `joinLeague` uses `protectedProcedure` (any authenticated user can join), NOT `commissionerProcedure`
- **`enforceLeagueCommissioner()` helper**: Already exists in `league.ts` — NOT needed for join (joining is open to all authenticated users)
- **Vitest `fileParallelism: false`**: Already configured — new test file will run sequentially with existing tests
- **Test cleanup order**: Delete participants first, then leagues, then users (FK constraint order)
- **`@@unique([userId, leagueId])` → `P2002`**: Prisma throws `PrismaClientKnownRequestError` with `code: "P2002"` on unique constraint violation
- **SSR hydration safety**: No `window` access needed in this story — the join page is a Server Component
- **`await params`**: Required in Next.js 15 — dynamic params are Promises

### Project Structure Notes

**New files:**
- `src/app/join/[token]/page.tsx` *(new — invite link handler / join page)*
- `src/server/api/routers/league-join.test.ts` *(new — integration tests for join procedures)*

**Modified files:**
- `src/server/api/routers/league.ts` *(add `getLeagueByToken` + `joinLeague` procedures)*
- `src/middleware.ts` *(add `join` to excluded routes in matcher regex)*

### References

- Join page route: [Source: architecture.md#Complete Project Directory Structure — app/join/[token]/page.tsx]
- FR6: "Participant can join a league using an invite link" [Source: epics.md#Requirements Inventory]
- UX Flow 1: "Invite link landing must lead with league context, not a generic sign-in screen" [Source: ux-design-specification.md#Flow 1]
- UX principle: "First-run via invite link — league context, not generic sign-in" [Source: ux-design-specification.md#Key UX Risks]
- Invite token unique index: [Source: prisma/schema.prisma — League.inviteToken @unique]
- Participant unique constraint: [Source: prisma/schema.prisma — @@unique([userId, leagueId])]
- Auth callback flow: [Source: architecture.md#Authentication & Security — "click invite link → enter email → click magic link → in app"]
- `publicProcedure` definition: [Source: src/server/api/trpc.ts]

## Dev Agent Record

### Agent Model Used

claude-opus-4-6

### Debug Log References

- Sign-in page had hardcoded `callbackUrl: "/dashboard"` — updated to read `callbackUrl` from URL search params via `useSearchParams()` so the join flow redirect works correctly after auth.

### Completion Notes List

- All 6 tasks completed. 5 new integration tests pass (15 total across all 3 test files).
- `getLeagueByToken` public procedure added — returns league preview (name, seriesId, participant count) without auth, returns `null` for invalid tokens.
- `joinLeague` protected procedure added — creates Participant record, catches Prisma P2002 unique constraint violation for duplicate joins and returns `{ alreadyMember: true }` gracefully.
- Middleware matcher updated to exclude `/join` routes so unauthenticated users can view the league preview page.
- `/join/[token]` Server Component page created with two-phase flow: invalid token → error state; authenticated → auto-join + redirect; unauthenticated → league preview + sign-in CTA with `callbackUrl`.
- Sign-in page updated to read `callbackUrl` from search params (was hardcoded to `/dashboard`) — enables the invite link → sign-in → auto-join redirect chain.

### File List

- `src/server/api/routers/league.ts` (modified — added `getLeagueByToken` + `joinLeague` procedures, imported `publicProcedure`)
- `src/middleware.ts` (modified — added `join` to excluded routes in matcher regex)
- `src/app/join/[token]/page.tsx` (new — invite link handler / join page)
- `src/app/sign-in/page.tsx` (modified — read `callbackUrl` from search params instead of hardcoding `/dashboard`)
- `src/server/api/routers/league-join.test.ts` (new — 5 integration tests for join procedures)

## Senior Developer Review (AI)

**Review Date:** 2026-03-15
**Reviewer Model:** claude-opus-4-6
**Review Outcome:** Approve (after fixes)

**Findings:** 1 High, 3 Medium, 3 Low

### Action Items

- [x] [HIGH] `join/[token]/page.tsx` — `<BottomNav />` rendered for unauthenticated users on join page; shows auth-gated nav links, contradicts UX spec's focused join experience → Fixed: removed BottomNav from join page
- [x] [MED] `join/[token]/page.tsx` — no error handling around `joinLeague` call; unexpected DB errors crash the Server Component → Fixed: wrapped in try/catch with user-friendly error state, redirect outside try/catch to avoid catching Next.js internal throw
- [x] [MED] `league.ts` — `getLeagueByToken` returns internal `id` to unauthenticated users unnecessarily → Fixed: removed `id` from select and response
- [x] [MED] `sign-in/page.tsx` — `useSearchParams()` in SignInForm without `Suspense` boundary triggers Next.js warning → Fixed: wrapped `<SignInForm />` in `<Suspense>`
- [ ] [LOW] Token inputs accept empty string (no `.min(1)` on `z.string()`) → Deferred
- [ ] [LOW] Middleware comment not updated to mention `/join` exclusion → Deferred
- [ ] [LOW] `callbackUrl` not validated as relative path (relies on NextAuth built-in protection) → Deferred

## Change Log

- 2026-03-14: Story 2.3 created by SM agent.
- 2026-03-14: Story 2.3 implemented — getLeagueByToken public procedure, joinLeague protected procedure with P2002 duplicate handling, middleware exclusion for /join routes, two-phase join page (preview → sign-in → auto-join), sign-in page callbackUrl support, 5 integration tests.
- 2026-03-15: Code review (claude-opus-4-6) — 4 issues fixed: removed BottomNav from unauthenticated join page, added error handling around joinLeague with redirect outside try/catch, removed id from public getLeagueByToken response, wrapped SignInForm in Suspense boundary for useSearchParams.
