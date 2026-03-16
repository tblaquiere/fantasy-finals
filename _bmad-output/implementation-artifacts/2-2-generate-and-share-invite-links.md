# Story 2.2: Generate & Share Invite Links

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a commissioner,
I want to generate a shareable invite link for my league,
so that friends can join without me manually adding them.

## Acceptance Criteria

1. **Given** I am the commissioner of a league, **when** I open the league settings page, **then** I see a generated invite link with a unique token I can copy to my clipboard with one tap.

2. **Given** an invite link is displayed, **when** I tap the "Copy Link" button, **then** the full invite URL is copied to my clipboard and I see visual confirmation ("Copied!") for 2 seconds.

3. **Given** an invite link exists, **when** I tap "Regenerate" and confirm, **then** the old token is invalidated, a new token is generated, and the displayed URL updates immediately.

4. **Given** a non-commissioner authenticated user visits `/league/[leagueId]/settings`, **when** the page loads, **then** they receive a `FORBIDDEN` tRPC error — commissioner controls are never rendered for non-commissioners.

5. **Given** Vitest is configured, **when** `pnpm test` is run, **then** the `league.getInviteToken` and `league.regenerateInviteToken` procedures are covered by integration tests using a real database connection.

## Tasks / Subtasks

- [x] Task 1: Add `inviteToken` to League Prisma model (AC: #1, #3)
  - [x] Add `inviteToken String? @unique @map("invite_token")` field to `League` model in `prisma/schema.prisma`
  - [x] Run `pnpm prisma db push` to apply schema change to Railway DB
  - [x] Run `pnpm prisma generate` to regenerate Prisma client
  - [x] Run `pnpm typecheck` — zero errors

- [x] Task 2: Update `createLeague` to auto-generate invite token (AC: #1)
  - [x] In `src/server/api/routers/league.ts`, update the `tx.league.create(...)` call to include `inviteToken: crypto.randomUUID()` in the `data` object
  - [x] Run `pnpm typecheck` — zero errors

- [x] Task 3: Add `getInviteToken` and `regenerateInviteToken` to league router (AC: #1, #3, #4)
  - [x] Add `getInviteToken` — `commissionerProcedure`, input: `{ leagueId: z.string() }`, verifies caller is a commissioner participant of THIS league, returns `{ token: string | null }` (see Dev Notes)
  - [x] Add `regenerateInviteToken` — `commissionerProcedure`, input: `{ leagueId: z.string() }`, same per-league ownership check, generates `crypto.randomUUID()`, updates `inviteToken` on `League`, returns `{ token: string }`
  - [x] Run `pnpm typecheck` — zero errors

- [x] Task 4: Create `src/components/league/InviteLink.tsx` (AC: #1, #2, #3)
  - [x] `"use client"` — interactivity required for clipboard and optimistic token display
  - [x] Props: `leagueId: string`, `initialToken: string`
  - [x] Display the full invite URL: `${window.location.origin}/join/${token}` in a read-only input
  - [x] "Copy Link" button: calls `navigator.clipboard.writeText(url)`, toggles button label to "Copied!" for 2 seconds, then resets (see Dev Notes)
  - [x] "Regenerate" button: calls `api.league.regenerateInviteToken.useMutation()`, updates displayed token on success (see Dev Notes for confirmation UX)
  - [x] Loading state: "Regenerating…" while mutation is pending
  - [x] Dark theme: input `bg-zinc-800 border-zinc-700 text-zinc-300`, copy button `bg-orange-500 text-white`, regenerate button `text-zinc-400 hover:text-zinc-200` (text/ghost style)
  - [x] Run `pnpm typecheck` — zero errors

- [x] Task 5: Create `src/app/league/[leagueId]/settings/page.tsx` (AC: #1, #4)
  - [x] Server Component — calls `auth()`, redirects to `/sign-in` if unauthenticated
  - [x] Calls `caller.league.getInviteToken({ leagueId })` — catch `FORBIDDEN` TRPCError and render access-denied state instead of crashing (see Dev Notes)
  - [x] Renders `<InviteLink leagueId={leagueId} initialToken={token} />` inside a settings card
  - [x] Page title: "League Settings" styled `text-orange-500`
  - [x] Includes `<BottomNav />`
  - [x] Dark theme consistent with rest of app: `min-h-screen bg-zinc-950 pb-16 text-zinc-50`
  - [x] Run `pnpm typecheck` — zero errors

- [x] Task 6: Add "Settings" link to league home page `src/app/league/[leagueId]/page.tsx` (AC: #1)
  - [x] After the participants list, add a `<Link href={`/league/${league.id}/settings`}>` styled as a secondary button visible only to the commissioner (check `p.isCommissioner && p.userId === session.user.id` against league.participants)
  - [x] Label: "League Settings"
  - [x] Style: `text-zinc-400 hover:text-zinc-200 underline text-sm` (low-prominence link — not a primary action)
  - [x] Run `pnpm typecheck` — zero errors

- [x] Task 7: Write Vitest integration tests for new procedures (AC: #5)
  - [x] Create `src/server/api/routers/league-invite.test.ts` (keep separate from 2.1 tests for clarity)
  - [x] Test: `getInviteToken` — commissioner can read their league's token
  - [x] Test: `getInviteToken` — non-commissioner receives `FORBIDDEN`
  - [x] Test: `getInviteToken` — user with commissioner role but not a member of this league receives `FORBIDDEN`
  - [x] Test: `regenerateInviteToken` — commissioner generates a new token; old token is replaced; new token is returned
  - [x] Test: `regenerateInviteToken` — non-commissioner receives `FORBIDDEN`
  - [x] Use same `beforeEach` / `afterEach` cleanup pattern as `league.test.ts` (see Dev Notes)
  - [x] Run `pnpm test` — all tests pass

- [x] Task 8: Run `pnpm lint` and `pnpm typecheck` — zero errors (AC: all)
  - [x] `pnpm typecheck` — 0 errors ✅
  - [x] `SKIP_ENV_VALIDATION=true pnpm lint` — 0 errors ✅

## Dev Notes

### Prisma Schema Change

Add to the `League` model in `prisma/schema.prisma` (after `updatedAt`):

```prisma
model League {
  id                   String        @id @default(cuid())
  name                 String
  seriesId             String        @map("series_id")
  clockDurationMinutes Int           @map("clock_duration_minutes")
  inviteToken          String?       @unique @map("invite_token")   // ← add this
  createdById          String        @map("created_by_id")
  createdAt            DateTime      @default(now()) @map("created_at")
  updatedAt            DateTime      @updatedAt @map("updated_at")

  createdBy    User          @relation("LeagueCreator", fields: [createdById], references: [id])
  participants Participant[]

  @@map("leagues")
}
```

After schema change:
```bash
pnpm prisma db push    # applies to Railway DB
pnpm prisma generate   # regenerates Prisma client
```

### Auto-Generate Token on League Creation

In `league.ts`, update the `tx.league.create(...)` data object inside the `$transaction`:

```ts
const created = await tx.league.create({
  data: {
    name: input.name,
    seriesId: input.seriesId,
    clockDurationMinutes: input.clockDurationMinutes,
    inviteToken: crypto.randomUUID(),   // ← add this line
    createdById: userId,
    participants: {
      create: { userId, isCommissioner: true },
    },
  },
});
```

`crypto.randomUUID()` is available globally in Node.js 18+ — no import required.

### Per-League Commissioner Ownership Check

`commissionerProcedure` checks that the user has the `commissioner` or `admin` role globally. It does NOT verify that the user is the commissioner of THIS specific league. Always add a per-league ownership check in league-scoped commissioner procedures:

```ts
getInviteToken: commissionerProcedure
  .input(z.object({ leagueId: z.string() }))
  .query(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;
    const isAdmin = ctx.session.user.role === "admin";

    // Admins can read any league's settings; commissioners must be a member
    if (!isAdmin) {
      const member = await ctx.db.participant.findUnique({
        where: { userId_leagueId: { userId, leagueId: input.leagueId } },
      });
      if (!member?.isCommissioner) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not a commissioner of this league" });
      }
    }

    const league = await ctx.db.league.findUnique({
      where: { id: input.leagueId },
      select: { inviteToken: true },
    });

    if (!league) {
      throw new TRPCError({ code: "NOT_FOUND", message: "League not found" });
    }

    return { token: league.inviteToken };
  }),

regenerateInviteToken: commissionerProcedure
  .input(z.object({ leagueId: z.string() }))
  .mutation(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;
    const isAdmin = ctx.session.user.role === "admin";

    if (!isAdmin) {
      const member = await ctx.db.participant.findUnique({
        where: { userId_leagueId: { userId, leagueId: input.leagueId } },
      });
      if (!member?.isCommissioner) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not a commissioner of this league" });
      }
    }

    const newToken = crypto.randomUUID();
    await ctx.db.league.update({
      where: { id: input.leagueId },
      data: { inviteToken: newToken },
    });

    return { token: newToken };
  }),
```

### InviteLink Component — Full Implementation

```tsx
// src/components/league/InviteLink.tsx
"use client";

import { useState } from "react";

import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";

interface InviteLinkProps {
  leagueId: string;
  initialToken: string;
}

export function InviteLink({ leagueId, initialToken }: InviteLinkProps) {
  const [token, setToken] = useState(initialToken);
  const [copied, setCopied] = useState(false);

  const inviteUrl = `${window.location.origin}/join/${token}`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const regenerate = api.league.regenerateInviteToken.useMutation({
    onSuccess: ({ token: newToken }) => setToken(newToken),
  });

  return (
    <div className="space-y-3">
      <p className="text-sm text-zinc-400">Share this link to invite friends to your league.</p>
      <div className="flex gap-2">
        <Input
          readOnly
          value={inviteUrl}
          className="border-zinc-700 bg-zinc-800 text-zinc-300 text-sm"
        />
        <Button
          onClick={handleCopy}
          className="shrink-0 bg-orange-500 text-white hover:bg-orange-600"
        >
          {copied ? "Copied!" : "Copy Link"}
        </Button>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => regenerate.mutate({ leagueId })}
        disabled={regenerate.isPending}
        className="text-zinc-400 hover:text-zinc-200"
      >
        {regenerate.isPending ? "Regenerating…" : "Regenerate link"}
      </Button>
      {regenerate.isError && (
        <p className="text-sm text-red-400">{regenerate.error.message}</p>
      )}
    </div>
  );
}
```

**Note on `window.location.origin`:** Using `window.location.origin` in a client component works correctly in the browser — it returns the domain including protocol. Since `InviteLink` is a `"use client"` component, `window` is available.

### Settings Page — Server-Side Data Fetching

```tsx
// src/app/league/[leagueId]/settings/page.tsx
import { notFound, redirect } from "next/navigation";
import { TRPCError } from "@trpc/server";

import { auth } from "~/server/auth";
import { createCaller } from "~/server/api/root";
import { db } from "~/server/db";
import { InviteLink } from "~/components/league/InviteLink";
import { BottomNav } from "~/components/shared/BottomNav";

interface Props {
  params: Promise<{ leagueId: string }>;
}

export default async function LeagueSettingsPage({ params }: Props) {
  const { leagueId } = await params;
  const session = await auth();
  if (!session) redirect("/sign-in");

  const caller = createCaller({ db, session, headers: new Headers() });

  let token: string | null;
  try {
    const result = await caller.league.getInviteToken({ leagueId });
    token = result.token;
  } catch (err) {
    if (err instanceof TRPCError && err.code === "FORBIDDEN") {
      return (
        <main className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-50">
          <p className="text-zinc-400">You don't have access to these settings.</p>
        </main>
      );
    }
    notFound();
  }

  return (
    <main className="min-h-screen bg-zinc-950 pb-16 text-zinc-50">
      <div className="mx-auto max-w-xl px-4 py-6">
        <h1 className="mb-6 text-2xl font-bold text-orange-500">League Settings</h1>

        <div className="rounded-xl bg-zinc-900 p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">
            Invite Link
          </h2>
          {token ? (
            <InviteLink leagueId={leagueId} initialToken={token} />
          ) : (
            <p className="text-sm text-zinc-500">No invite link yet — regenerate to create one.</p>
          )}
        </div>
      </div>
      <BottomNav />
    </main>
  );
}
```

**Note:** `token` should never be null after Story 2.2 Task 2 because `createLeague` auto-generates the token. The `token ? <InviteLink ... /> : <p>...</p>` null guard is for any leagues that existed before this story was deployed (they won't have a token yet).

### League Home Page — Settings Link for Commissioner

In `src/app/league/[leagueId]/page.tsx`, after the participants list and before `<BottomNav />`, add:

```tsx
import Link from "next/link";

// Inside the component, after participants list:
{league.participants.some(
  (p) => p.isCommissioner && p.user.id === session.user.id
) && (
  <div className="mt-6">
    <Link
      href={`/league/${league.id}/settings`}
      className="text-sm text-zinc-400 underline hover:text-zinc-200"
    >
      League Settings
    </Link>
  </div>
)}
```

The `session` is already fetched at the top of the page. The `league.participants` array is already included in the `getLeague` response from Story 2.1.

### Integration Tests — Pattern for league-invite.test.ts

The tests follow the same pattern as `league.test.ts` from Story 2.1:

```ts
// src/server/api/routers/league-invite.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TRPCError } from "@trpc/server";
import { createCaller } from "~/server/api/root";
import { db, makeSession } from "~/test/helpers";

function makeCaller(session = makeSession()) {
  return createCaller({ db, session, headers: new Headers() });
}

// Create test users with COMMISSIONER role for commissioner-procedure tests
async function makeCommissionerSession(userId = "test-user-id") {
  return makeSession({ id: userId, role: "commissioner" });
}

beforeEach(async () => {
  await db.user.upsert({
    where: { id: "test-user-id" },
    create: { id: "test-user-id", email: "test@example.com", role: "commissioner" },
    update: { role: "commissioner" },
  });
});

afterEach(async () => {
  await db.participant.deleteMany({ where: { userId: { startsWith: "test-" } } });
  await db.league.deleteMany({ where: { createdById: { startsWith: "test-" } } });
  await db.user.deleteMany({ where: { id: { startsWith: "test-" } } });
});

describe("league.getInviteToken", () => {
  it("commissioner can read their league's invite token", async () => {
    // Arrange: create a league (auto-generates inviteToken)
    const caller = makeCaller(await makeCommissionerSession());
    const { leagueId } = await caller.league.createLeague({
      name: "Token Test League",
      seriesId: "2025-wc1-okc-memphis",
      clockDurationMinutes: 30,
    });

    const result = await caller.league.getInviteToken({ leagueId });
    expect(result.token).toBeTruthy();
  });

  it("throws FORBIDDEN for non-commissioner participant", async () => {
    // Create league as commissioner
    const commCaller = makeCaller(await makeCommissionerSession());
    const { leagueId } = await commCaller.league.createLeague({
      name: "Private League",
      seriesId: "2025-ec1-celtics-heat",
      clockDurationMinutes: 15,
    });

    // Create outsider user and caller
    await db.user.upsert({
      where: { id: "test-outsider-id" },
      create: { id: "test-outsider-id", email: "outsider@example.com", role: "participant" },
      update: {},
    });
    const outsiderCaller = makeCaller(
      makeSession({ id: "test-outsider-id", role: "participant" })
    );

    let caught: TRPCError | undefined;
    try {
      await outsiderCaller.league.getInviteToken({ leagueId });
    } catch (e) {
      if (e instanceof TRPCError) caught = e;
    }
    expect(caught?.code).toBe("FORBIDDEN");
  });

  it("throws FORBIDDEN for commissioner of a different league", async () => {
    // Create first league
    const commCaller = makeCaller(await makeCommissionerSession());
    const { leagueId } = await commCaller.league.createLeague({
      name: "League Alpha",
      seriesId: "2025-wc1-okc-memphis",
      clockDurationMinutes: 30,
    });

    // Second commissioner user — has commissioner role but is NOT a member of leagueId
    await db.user.upsert({
      where: { id: "test-other-comm-id" },
      create: { id: "test-other-comm-id", email: "other@example.com", role: "commissioner" },
      update: { role: "commissioner" },
    });
    const otherCommCaller = makeCaller(
      makeSession({ id: "test-other-comm-id", role: "commissioner" })
    );

    let caught: TRPCError | undefined;
    try {
      await otherCommCaller.league.getInviteToken({ leagueId });
    } catch (e) {
      if (e instanceof TRPCError) caught = e;
    }
    expect(caught?.code).toBe("FORBIDDEN");
  });
});

describe("league.regenerateInviteToken", () => {
  it("commissioner can regenerate and replaces old token", async () => {
    const caller = makeCaller(await makeCommissionerSession());
    const { leagueId } = await caller.league.createLeague({
      name: "Regen League",
      seriesId: "2025-ec2-knicks-sixers",
      clockDurationMinutes: 45,
    });

    const { token: firstToken } = await caller.league.getInviteToken({ leagueId });

    const { token: newToken } = await caller.league.regenerateInviteToken({ leagueId });
    expect(newToken).toBeTruthy();
    expect(newToken).not.toBe(firstToken);

    // DB reflects new token
    const league = await db.league.findUnique({ where: { id: leagueId } });
    expect(league?.inviteToken).toBe(newToken);
  });

  it("throws FORBIDDEN for non-commissioner", async () => {
    const commCaller = makeCaller(await makeCommissionerSession());
    const { leagueId } = await commCaller.league.createLeague({
      name: "Protected League",
      seriesId: "2025-wc1-okc-memphis",
      clockDurationMinutes: 30,
    });

    await db.user.upsert({
      where: { id: "test-outsider-id" },
      create: { id: "test-outsider-id", email: "outsider@example.com", role: "participant" },
      update: {},
    });
    const outsiderCaller = makeCaller(
      makeSession({ id: "test-outsider-id", role: "participant" })
    );

    let caught: TRPCError | undefined;
    try {
      await outsiderCaller.league.regenerateInviteToken({ leagueId });
    } catch (e) {
      if (e instanceof TRPCError) caught = e;
    }
    expect(caught?.code).toBe("FORBIDDEN");
  });
});
```

**Important:** `commissionerProcedure` requires `commissioner` or `admin` role — test callers must use `role: "commissioner"` in the session, not `role: "participant"`. The `createLeague` mutation uses `protectedProcedure`, so any authenticated user can create a league; the invite token procedures use `commissionerProcedure`, so session role must be `commissioner`.

**Note on test user setup:** In these tests, `beforeEach` creates the test user with `role: "commissioner"` (not `participant` like in Story 2.1 tests) because `getInviteToken` and `regenerateInviteToken` use `commissionerProcedure`. The test for `createLeague` is in `league.test.ts` separately — no conflict.

### Architecture Anti-Patterns to Avoid

- ❌ Do NOT skip the per-league ownership check — `commissionerProcedure` is role-only, not league-scoped
- ❌ Do NOT expose `inviteToken` via `getLeague` to all authenticated members — tokens should only be readable by commissioners
- ❌ Do NOT store the invite URL in DB — reconstruct from `window.location.origin` + token in the client component
- ❌ Do NOT use `params.leagueId` directly in Next.js 15 pages — always `await params` first
- ❌ Do NOT call `api.league.*` hooks in Server Components — only in `"use client"` components
- ❌ Do NOT import `@prisma/client` — always `"generated/prisma"`

### Previous Story Learnings (from Story 2.1)

- **`commissionerProcedure`**: Available in `~/server/api/trpc` — use for all commissioner-scoped mutations/queries
- **`createCaller` pattern in Server Components**: `createCaller({ db, session, headers: new Headers() })` — already working
- **Vitest + ESM**: `server.deps.inline: [/next-auth/, /^next$/]` in `vitest.config.ts` — already configured
- **`db.$transaction()`**: Wrap multi-write operations; `createLeague` already uses it — the `inviteToken` addition fits inside the existing transaction
- **Prisma compound unique**: `@@unique([userId, leagueId])` maps to `userId_leagueId` in `findUnique` where clause
- **Test isolation**: Use `beforeEach` to set up test users with correct role; `afterEach` deletes in reverse dependency order
- **JWT role staleness**: `ctx.session.user.role` reflects JWT (set at sign-in), not DB role. If a user creates a league and is promoted to `commissioner` in the DB, their current JWT still says `participant`. For tests, set the session role explicitly.

### Project Structure Notes

**New files:**
- `src/components/league/InviteLink.tsx` *(new — copy+regenerate invite link UI)*
- `src/app/league/[leagueId]/settings/page.tsx` *(new — commissioner settings page)*
- `src/server/api/routers/league-invite.test.ts` *(new — integration tests for invite token procedures)*

**Modified files:**
- `prisma/schema.prisma` *(add `inviteToken` to League model)*
- `src/server/api/routers/league.ts` *(add `getInviteToken` + `regenerateInviteToken` procedures; update `createLeague` to generate token)*
- `src/app/league/[leagueId]/page.tsx` *(add "League Settings" link for commissioner)*

### References

- `InviteLink.tsx` component location: [Source: architecture.md#Complete Project Directory Structure — components/league/InviteLink.tsx]
- Commissioner controls at 2 taps max: [Source: ux-design-specification.md#"Commissioner controls as contextual actions"]
- `commissionerProcedure` usage: [Source: architecture.md#Implementation Patterns — RBAC Enforcement]
- Invite link page route: [Source: architecture.md#Complete Project Directory Structure — app/join/[token]/page.tsx] (Story 2.3 builds the join side)
- Settings page route: [Source: architecture.md#Complete Project Directory Structure — app/(auth)/league/[leagueId]/settings/page.tsx]
- `TRPCError` always thrown, never returned: [Source: architecture.md#Format Patterns — Error Response Structure]
- Clipboard + copy UX: [Source: epics.md#Story 2.2 AC — "copy it to my clipboard with one tap"]

## Senior Developer Review (AI)

**Review Date:** 2026-03-14
**Reviewer Model:** claude-opus-4-6
**Review Outcome:** Approve (after fixes)

**Findings:** 2 High, 3 Medium, 2 Low

### Action Items

- [x] [HIGH] `InviteLink.tsx` — `window.location.origin` called during render causes SSR/hydration crash; `window` is undefined during server-side pre-rendering → Fixed: use `useState` + `useEffect` to defer origin access to client mount
- [x] [HIGH] `InviteLink.tsx` — `handleCopy` has no error handling for clipboard API failure; unhandled rejection if `navigator.clipboard.writeText` throws → Fixed: wrapped in try/catch with fallback alert
- [x] [MED] Duplicated 8-line per-league commissioner ownership check in `getInviteToken` and `regenerateInviteToken` → Fixed: extracted `enforceLeagueCommissioner()` helper function
- [x] [MED] AC #3 says "when I tap 'Regenerate' and **confirm**" — no confirmation dialog before destructive regeneration → Fixed: added `window.confirm()` before calling mutation
- [x] [MED] `regenerateInviteToken` does not verify league exists before `league.update()` — Prisma P2025 surfaces as generic 500 → Fixed: added `findUnique` existence check before update
- [ ] [LOW] Settings page has no "Back to league" navigation link → Deferred
- [ ] [LOW] Dev Notes template shows misleading `async makeCommissionerSession()` that is synchronous → Noted; actual test code is correct

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Vitest file concurrency: Both `league.test.ts` and `league-invite.test.ts` share `test-user-id` and ran concurrently by default — FK violations and race conditions on shared DB records. Fixed by adding `fileParallelism: false` to `vitest.config.ts` so test files run sequentially.

### Completion Notes List

- All 8 tasks completed. 6 new integration tests pass (5 new in `league-invite.test.ts`, plus bonus `invite token auto-generated` test; 10 total across both test files).
- `inviteToken` Prisma field added to League model, deployed to Railway DB via `db push`, Prisma client regenerated.
- `createLeague` mutation updated to auto-generate `inviteToken: crypto.randomUUID()` inside existing `$transaction`.
- `getInviteToken` and `regenerateInviteToken` added to `leagueRouter` using `commissionerProcedure` with per-league ownership check (role alone insufficient — verifies caller is commissioner of THIS league specifically).
- `InviteLink.tsx` client component: read-only URL input, "Copy Link" with 2s "Copied!" feedback, "Regenerate link" ghost button with pending/error states.
- `/league/[leagueId]/settings` settings page: server component, FORBIDDEN → access-denied state, NOT_FOUND → notFound().
- League home page updated: "League Settings" link conditionally rendered for the commissioner of that league.
- `vitest.config.ts` updated: added `fileParallelism: false` to prevent FK race conditions when multiple test files share DB state.

### File List

- `prisma/schema.prisma` (modified — `inviteToken` field added to League model)
- `src/server/api/routers/league.ts` (modified — `inviteToken` in createLeague, `getInviteToken` + `regenerateInviteToken` procedures added)
- `src/components/league/InviteLink.tsx` (new)
- `src/app/league/[leagueId]/settings/page.tsx` (new)
- `src/app/league/[leagueId]/page.tsx` (modified — "League Settings" link for commissioner)
- `src/server/api/routers/league-invite.test.ts` (new — 6 integration tests)
- `vitest.config.ts` (modified — `fileParallelism: false`)

## Change Log

- 2026-03-14: Story 2.2 created by SM agent.
- 2026-03-14: Story 2.2 implemented — inviteToken schema field, auto-generation in createLeague, getInviteToken + regenerateInviteToken tRPC procedures, InviteLink component, settings page, commissioner Settings link on league home, 6 integration tests. fileParallelism: false added to vitest config to fix test file concurrency issue.
- 2026-03-14: Code review (claude-opus-4-6) — 5 issues fixed: SSR-safe window.location.origin via useEffect, clipboard error handling with try/catch fallback, extracted enforceLeagueCommissioner() helper to DRY ownership check, added window.confirm() before regeneration, added league existence check in regenerateInviteToken.
