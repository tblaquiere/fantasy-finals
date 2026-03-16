# Story 2.5: Multi-League Dashboard

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want a dashboard showing all my leagues with current status,
so that I can quickly navigate between multiple leagues and know what needs my attention.

## Acceptance Criteria

1. **Given** I am a member of one or more leagues (in any role), **when** I open the dashboard, **then** each league is shown as a card displaying: league name, series name, participant count, and whether I am the commissioner — **and** any league where it's my draft turn is visually indicated as requiring action (the "needs attention" indicator is scaffolded now; will activate in Epic 3 when draft state is introduced).

2. **Given** I am a commissioner and create a second league, **when** I open the dashboard, **then** both leagues appear as independent cards — participant data, picks, and standings never cross between leagues (enforced at the API layer by per-league `Participant` records).

3. **Given** I have no league memberships, **when** I open the dashboard, **then** I see an empty state with two CTAs: a "Create League" button (navigates to `/league/new`) and an invite-link input field (accepts a pasted full URL or raw token and navigates to `/join/[token]`).

4. **Given** Vitest is configured, **when** `pnpm test` is run, **then** the `league.getMyLeagues` procedure is covered by integration tests using a real database connection.

## Tasks / Subtasks

- [x] Task 1: Add `getMyLeagues` query to league router (AC: #1, #2)
  - [x] Add `getMyLeagues` to `src/server/api/routers/league.ts` — `protectedProcedure`, no input
  - [x] Query: `db.participant.findMany({ where: { userId }, include: { league: { include: { _count: { select: { participants: true } } } } }, orderBy: { joinedAt: "asc" } })`
  - [x] Return array: `{ leagueId, leagueName, seriesId, participantCount, isCommissioner, joinedAt }`
  - [x] Do NOT expose `inviteToken` or any other user's personal data in this response
  - [x] Run `pnpm typecheck` — zero errors

- [x] Task 2: Create `src/components/league/LeagueCard.tsx` (AC: #1)
  - [x] Pure presentational component — no `"use client"` needed (no interactivity); wrap entire card in `<Link href={`/league/${leagueId}`}>` for navigation
  - [x] Props: `leagueId: string`, `leagueName: string`, `seriesName: string`, `participantCount: number`, `isCommissioner: boolean`, `needsAttention?: boolean`
  - [x] `needsAttention` defaults to `false` — reserved for draft turn state in Epic 3; when `true`, show an orange dot or "Your turn" badge
  - [x] Commissioner badge: `rounded-full bg-orange-500/20 px-2 py-0.5 text-xs font-medium text-orange-400` text "Commissioner" (same style as league home page participant badge)
  - [x] Participant count line: `"{participantCount} participant{participantCount !== 1 ? 's' : ''}"`
  - [x] Card style: `block rounded-xl bg-zinc-900 px-4 py-4 hover:bg-zinc-800 transition-colors`
  - [x] Run `pnpm typecheck` — zero errors

- [x] Task 3: Create `src/components/league/EmptyDashboard.tsx` — empty state with dual CTAs (AC: #3)
  - [x] `"use client"` — needs `useState` + `useRouter` for invite-link input
  - [x] Render a "Create League" `<Link href="/league/new">` button (orange, same styling as current dashboard CTA)
  - [x] Render a text input: `placeholder="Paste invite link or token…"` + "Join" button
  - [x] On Join click: extract token from full URL using `RegExp#exec()` — if match, use `match[1]`; else use trimmed input as raw token; if token is non-empty, call `router.push('/join/' + token)`
  - [x] Disable Join button when input is empty
  - [x] Run `pnpm typecheck` — zero errors

- [x] Task 4: Update `src/app/dashboard/page.tsx` to render real league list (AC: #1, #2, #3)
  - [x] Remove the current hardcoded empty state JSX (the `<div className="flex flex-col...">` block at lines 17–25)
  - [x] Add `createCaller` import and tRPC server-side fetch: `const leagues = await createCaller({ db, session, headers: new Headers() }).league.getMyLeagues()`
  - [x] Import `LeagueCard` from `~/components/league/LeagueCard`
  - [x] Import `EmptyDashboard` from `~/components/league/EmptyDashboard`
  - [x] Import `SERIES_STUBS` from `~/lib/constants` for series name lookup
  - [x] `session` is already fetched; if `!session` redirect to `/sign-in` (already present in page via middleware, but add explicit check for safety)
  - [x] If `leagues.length === 0` → render `<EmptyDashboard />`
  - [x] Else → render `<div className="space-y-3">` with a `<LeagueCard>` for each league; resolve `seriesName` via `SERIES_STUBS.find(s => s.id === league.seriesId)?.name ?? league.seriesId`
  - [x] Remove `import Link from "next/link"` if no longer used directly (Link is used inside child components now)
  - [x] Keep `<PushPermissionPrompt />` and `<BottomNav />` unchanged
  - [x] Run `pnpm typecheck` — zero errors

- [x] Task 5: Write Vitest integration tests for `getMyLeagues` (AC: #4)
  - [x] Create `src/server/api/routers/league-dashboard.test.ts`
  - [x] Test: user with no leagues returns empty array
  - [x] Test: user with one league returns that league with correct fields (`leagueId`, `leagueName`, `seriesId`, `participantCount`, `isCommissioner`)
  - [x] Test: user with two leagues (one as commissioner, one as participant) returns both with correct `isCommissioner` values
  - [x] Test: user only sees their own leagues — a second user's league is not returned
  - [x] Test: `participantCount` reflects total participants, not just the caller
  - [x] Run `pnpm test` — all tests pass (25/25)

- [x] Task 6: Run `pnpm lint` and `pnpm typecheck` — zero errors (AC: all)
  - [x] `pnpm typecheck` — 0 errors
  - [x] `SKIP_ENV_VALIDATION=true pnpm lint` — 0 errors

## Dev Notes

### MVP Data Caveat — Draft Turn and Standings

The AC mentions "draft turn" indicators and "standings position" — these require Epic 3 (draft system) and Epic 6 (standings) data. In Story 2.5:

- **Draft turn**: `needsAttention` prop on `LeagueCard` is always `false`. The indicator is scaffolded (built, styled) but won't activate until Epic 3 adds a `Participant.isDraftTurn` field or equivalent.
- **Standings position**: not shown yet — show `participantCount` as the available league metadata.
- **Current game number**: not tracked in Epic 2 — show series name instead.

No schema changes are needed for this story.

### `getMyLeagues` — Full Procedure

```ts
getMyLeagues: protectedProcedure
  .query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const participations = await ctx.db.participant.findMany({
      where: { userId },
      include: {
        league: {
          include: {
            _count: { select: { participants: true } },
          },
        },
      },
      orderBy: { joinedAt: "asc" },
    });
    return participations.map((p) => ({
      leagueId: p.leagueId,
      leagueName: p.league.name,
      seriesId: p.league.seriesId,
      participantCount: p.league._count.participants,
      isCommissioner: p.isCommissioner,
      joinedAt: p.joinedAt,
    }));
  }),
```

**Do NOT include `inviteToken` in the response** — token should only be returned by `getInviteToken` (commissioner-gated). Also do NOT include other users' data.

### `LeagueCard.tsx` — Full Component

```tsx
// src/components/league/LeagueCard.tsx
import Link from "next/link";

interface LeagueCardProps {
  leagueId: string;
  leagueName: string;
  seriesName: string;
  participantCount: number;
  isCommissioner: boolean;
  needsAttention?: boolean;
}

export function LeagueCard({
  leagueId,
  leagueName,
  seriesName,
  participantCount,
  isCommissioner,
  needsAttention = false,
}: LeagueCardProps) {
  return (
    <Link
      href={`/league/${leagueId}`}
      className="block rounded-xl bg-zinc-900 px-4 py-4 transition-colors hover:bg-zinc-800"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="font-semibold text-zinc-100">{leagueName}</p>
          <p className="mt-0.5 text-sm text-zinc-400">{seriesName}</p>
          <p className="mt-1 text-xs text-zinc-500">
            {participantCount} participant{participantCount !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {isCommissioner && (
            <span className="rounded-full bg-orange-500/20 px-2 py-0.5 text-xs font-medium text-orange-400">
              Commissioner
            </span>
          )}
          {needsAttention && (
            <span className="rounded-full bg-green-500/20 px-2 py-0.5 text-xs font-medium text-green-400">
              Your turn
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
```

### `EmptyDashboard.tsx` — Full Component

```tsx
// src/components/league/EmptyDashboard.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export function EmptyDashboard() {
  const [inviteInput, setInviteInput] = useState("");
  const router = useRouter();

  const handleJoin = () => {
    const match = inviteInput.match(/\/join\/([^/?#]+)/);
    const token = match ? match[1] : inviteInput.trim();
    if (token) router.push(`/join/${token}`);
  };

  return (
    <div className="flex flex-col items-center gap-6 py-12 text-center">
      <p className="text-zinc-400">No leagues yet — create one or join via invite link.</p>
      <Link
        href="/league/new"
        className="rounded-xl bg-orange-500 px-6 py-3 text-sm font-bold text-white hover:bg-orange-600"
      >
        Create League
      </Link>
      <div className="flex w-full max-w-sm gap-2">
        <input
          type="text"
          value={inviteInput}
          onChange={(e) => setInviteInput(e.target.value)}
          placeholder="Paste invite link or token…"
          className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-300 placeholder-zinc-500 focus:border-orange-500 focus:outline-none"
        />
        <button
          onClick={handleJoin}
          disabled={!inviteInput.trim()}
          className="rounded-lg bg-zinc-700 px-4 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-600 disabled:opacity-50"
        >
          Join
        </button>
      </div>
    </div>
  );
}
```

### Updated `dashboard/page.tsx` — Full Page

```tsx
// src/app/dashboard/page.tsx
import { redirect } from "next/navigation";

import { auth } from "~/server/auth";
import { createCaller } from "~/server/api/root";
import { db } from "~/server/db";
import { SERIES_STUBS } from "~/lib/constants";
import { LeagueCard } from "~/components/league/LeagueCard";
import { EmptyDashboard } from "~/components/league/EmptyDashboard";
import { BottomNav } from "~/components/shared/BottomNav";
import { PushPermissionPrompt } from "~/components/shared/PushPermissionPrompt";

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect("/sign-in");

  const caller = createCaller({ db, session, headers: new Headers() });
  const leagues = await caller.league.getMyLeagues();

  return (
    <main className="min-h-screen bg-zinc-950 pb-16 text-zinc-50">
      <div className="mx-auto max-w-xl px-4 py-6">
        <h1 className="mb-1 text-2xl font-bold text-orange-500">Fantasy Finals</h1>
        <p className="mb-6 text-sm text-zinc-400">{session.user.email}</p>

        {leagues.length === 0 ? (
          <EmptyDashboard />
        ) : (
          <div className="space-y-3">
            {leagues.map((league) => {
              const seriesName =
                SERIES_STUBS.find((s) => s.id === league.seriesId)?.name ?? league.seriesId;
              return (
                <LeagueCard
                  key={league.leagueId}
                  leagueId={league.leagueId}
                  leagueName={league.leagueName}
                  seriesName={seriesName}
                  participantCount={league.participantCount}
                  isCommissioner={league.isCommissioner}
                />
              );
            })}
          </div>
        )}

        <PushPermissionPrompt />
      </div>
      <BottomNav />
    </main>
  );
}
```

### Test Setup — `league-dashboard.test.ts`

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createCaller } from "~/server/api/root";
import { db, makeSession } from "~/test/helpers";

function makeCaller(userId: string, role: "participant" | "commissioner" = "participant") {
  return createCaller({
    db,
    session: makeSession({ id: userId, role }),
    headers: new Headers(),
  });
}

beforeEach(async () => {
  await db.user.upsert({
    where: { id: "test-dash-user1" },
    create: { id: "test-dash-user1", email: "dash-user1@example.com", role: "participant" },
    update: { role: "participant" },
  });
  await db.user.upsert({
    where: { id: "test-dash-user2" },
    create: { id: "test-dash-user2", email: "dash-user2@example.com", role: "participant" },
    update: { role: "participant" },
  });
});

afterEach(async () => {
  await db.participant.deleteMany({ where: { userId: { startsWith: "test-dash-" } } });
  await db.league.deleteMany({ where: { createdById: { startsWith: "test-dash-" } } });
  await db.user.deleteMany({ where: { id: { startsWith: "test-dash-" } } });
});
```

**Note on cleanup order**: participants → leagues → users (FK constraint order — same as all previous test files).

### Architecture Anti-Patterns to Avoid

- Do NOT call `api.league.*` hooks in Server Components — `LeagueCard` is a Server Component (no `"use client"`); `EmptyDashboard` is the only Client Component
- Do NOT expose `inviteToken` from `getMyLeagues` — token is commissioner-only via `getInviteToken`
- Do NOT add `"use client"` to `dashboard/page.tsx` or `LeagueCard.tsx` — they are Server Components; only `EmptyDashboard` and `PushPermissionPrompt` are client
- Do NOT import `@prisma/client` — always `"generated/prisma"`
- Do NOT use `params.X` directly in Next.js 15 pages — always `await params` (not applicable here since dashboard has no params)
- Do NOT query `League` directly for user's leagues — query `Participant.findMany({ where: { userId } })` and include the league; this avoids a separate membership check

### Previous Story Learnings (Stories 2.1–2.4)

- **Server-side tRPC calls**: Use `createCaller({ db, session, headers: new Headers() })` — same pattern as `league/[leagueId]/page.tsx` and `settings/page.tsx`
- **Test cleanup order**: participants → leagues → users (FK constraint order — enforced in every test file so far)
- **`fileParallelism: false`** already set in `vitest.config.ts` — no change needed
- **Styling**: Dark theme `bg-zinc-950`, cards `bg-zinc-900`, hover `bg-zinc-800`, accent `orange-500`; see league home page (`src/app/league/[leagueId]/page.tsx`) for exact class patterns to reuse
- **Commissioner badge**: `rounded-full bg-orange-500/20 px-2 py-0.5 text-xs font-medium text-orange-400` — same pattern as league home page
- **`SERIES_STUBS` import**: `import { SERIES_STUBS } from "~/lib/constants"` — same as league home page
- **No `(auth)/` route group**: Dashboard is at `src/app/dashboard/page.tsx` (NOT `src/app/(auth)/dashboard/page.tsx`) — architecture doc mentions the route group but actual implementation uses flat structure

### Project Structure Notes

**New files:**
- `src/components/league/LeagueCard.tsx` *(new — league card component, named per architecture.md)*
- `src/components/league/EmptyDashboard.tsx` *(new — empty state with dual CTAs)*
- `src/server/api/routers/league-dashboard.test.ts` *(new — integration tests)*

**Modified files:**
- `src/server/api/routers/league.ts` *(add `getMyLeagues` procedure)*
- `src/app/dashboard/page.tsx` *(replace hardcoded empty state with real league list)*

### References

- `LeagueCard.tsx` component location: [Source: architecture.md#Complete Project Directory Structure — components/league/LeagueCard.tsx]
- FR4: "Commissioner can create and manage multiple independent leagues" [Source: epics.md#Requirements Inventory]
- Story 2.5 ACs: [Source: epics.md#Story 2.5: Multi-League Dashboard]
- Dashboard page route: [Source: src/app/dashboard/page.tsx — existing stub with comment "League list — populated in Story 2.5"]
- Styling patterns: [Source: src/app/league/[leagueId]/page.tsx — league home page]
- `createCaller` server-side pattern: [Source: src/app/league/[leagueId]/page.tsx:20]
- `SERIES_STUBS`: [Source: src/lib/constants.ts:5-10]
- Prisma `Participant` model: [Source: prisma/schema.prisma:104-116]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Lint error fixed: `EmptyDashboard.tsx` — `@typescript-eslint/prefer-regexp-exec` required switching `String#match()` to `RegExp#exec()` for token extraction regex.

### Completion Notes List

- All 6 tasks completed successfully; 25/25 tests pass.
- `getMyLeagues` procedure added to `league.ts` — queries via `Participant.findMany` with league `_count` include; returns clean shape without `inviteToken`.
- `LeagueCard.tsx` created — pure Server Component, full link card with commissioner badge and `needsAttention` scaffold for Epic 3.
- `EmptyDashboard.tsx` created — Client Component with "Create League" link + invite-URL/token input that extracts token via `RegExp#exec()` and navigates to `/join/[token]`.
- `dashboard/page.tsx` updated — replaces hardcoded stub with server-side `getMyLeagues` fetch, conditional empty state vs league list.
- 5 integration tests cover: empty return, single league fields, two leagues with mixed roles, isolation from other users' leagues, correct participant count.
- Code review fixes: wrapped invite input in `<form onSubmit>` for Enter key support (MED-1); removed redundant manual cleanup in multi-league test (MED-2).

### File List

- `src/server/api/routers/league.ts` *(modified — added `getMyLeagues` procedure)*
- `src/components/league/LeagueCard.tsx` *(new — league card component)*
- `src/components/league/EmptyDashboard.tsx` *(new — empty state client component)*
- `src/app/dashboard/page.tsx` *(modified — real league list replacing hardcoded stub)*
- `src/server/api/routers/league-dashboard.test.ts` *(new — 5 integration tests)*
