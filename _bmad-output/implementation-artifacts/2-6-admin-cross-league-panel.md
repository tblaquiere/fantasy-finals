# Story 2.6: Admin Cross-League Panel

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an admin,
I want to view all leagues across the platform and take corrective actions,
so that I can resolve issues in any league without being a member.

## Acceptance Criteria

1. **Given** I am an admin, **when** I navigate to `/admin`, **then** I see a list of all leagues across the platform displaying: league name, series name, commissioner name/email, participant count, and current phase ("Pre-draft" until Epic 3 activates game state).

2. **Given** I am an admin viewing the admin panel, **when** I click "Recalculate Draft Order" for a specific league, **then** the action is scaffolded — the button is present and calls the `admin.recalculateDraftOrder` tRPC procedure, which returns a `{ status: "not_available", message: "Draft order calculation requires Epic 3" }` response displayed as an informational toast. The real implementation arrives in Epic 3.

3. **Given** I am an admin, **when** I attempt to access the admin panel, **then** any non-admin authenticated user is shown a FORBIDDEN state ("Admin access required") and any unauthenticated user is redirected to `/sign-in`.

4. **Given** Vitest is configured, **when** `pnpm test` is run, **then** the `league.getAllLeagues` and `admin.recalculateDraftOrder` procedures are covered by integration tests using a real database connection.

## Tasks / Subtasks

- [x] Task 1: Add `getAllLeagues` to league router (AC: #1, #4)
  - [x] Add `getAllLeagues` to `src/server/api/routers/league.ts` — `adminProcedure`, no input
  - [x] Query: `db.league.findMany({ include: { participants: { where: { isCommissioner: true }, include: { user: { select: { id: true, name: true, email: true } } }, take: 1 }, _count: { select: { participants: true } } }, orderBy: { createdAt: "desc" } })`
  - [x] Return array: `{ leagueId, leagueName, seriesId, participantCount, commissioner: { userId, name, email } }`
  - [x] Do NOT expose `inviteToken` in this response
  - [x] Run `pnpm typecheck` — zero errors

- [x] Task 2: Create `src/server/api/routers/admin.ts` with `recalculateDraftOrder` (AC: #2, #4)
  - [x] Create new router `adminRouter` using `createTRPCRouter`
  - [x] Add `recalculateDraftOrder` — `adminProcedure`, input: `{ leagueId: z.string() }`
  - [x] Verify league exists via `db.league.findUnique({ where: { id: leagueId } })` — throw `NOT_FOUND` if missing
  - [x] Return `{ status: "not_available" as const, message: "Draft order calculation requires Epic 3" }`
  - [x] Run `pnpm typecheck` — zero errors

- [x] Task 3: Register admin router in `src/server/api/root.ts` (AC: #2)
  - [x] Import `adminRouter` and add `admin: adminRouter` to `appRouter`
  - [x] Run `pnpm typecheck` — zero errors

- [x] Task 4: Create `src/app/admin/page.tsx` — admin cross-league panel (AC: #1, #2, #3)
  - [x] Server Component — calls `auth()`, redirects to `/sign-in` if unauthenticated
  - [x] Check `session.user.role === "admin"` — if not, render access-denied state: `<p className="text-zinc-400">Admin access required.</p>` (do NOT redirect — show inline denial)
  - [x] Call `caller.league.getAllLeagues()` to fetch all leagues
  - [x] Render a table/list of leagues: league name, series name (lookup from `SERIES_STUBS`, fallback to seriesId), commissioner name/email, participant count, phase ("Pre-draft")
  - [x] Each league row includes a "Recalculate Draft Order" button — this is a Client Component island (see Task 5)
  - [x] Page title: "Admin Panel" styled `text-orange-500`
  - [x] Dark theme consistent with app: `min-h-screen bg-zinc-950 pb-16 text-zinc-50`
  - [x] Includes `<BottomNav />`
  - [x] Run `pnpm typecheck` — zero errors

- [x] Task 5: Create `src/components/admin/RecalculateButton.tsx` (AC: #2)
  - [x] `"use client"` — needs `useMutation` for the tRPC call and toast feedback
  - [x] Props: `leagueId: string`, `leagueName: string`
  - [x] On click: call `api.admin.recalculateDraftOrder.useMutation()`, on success show a toast: "Draft order recalculation: not available until Epic 3"
  - [x] Loading state: button shows "Recalculating…" and is disabled while pending
  - [x] Error state: show error toast on failure
  - [x] Style: `rounded-lg bg-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-600 disabled:opacity-50`
  - [x] Run `pnpm typecheck` — zero errors

- [x] Task 6: Write Vitest integration tests (AC: #4)
  - [x] Create `src/server/api/routers/admin.test.ts`
  - [x] Use `test-admin-` prefix for all test entities
  - [x] Test: `league.getAllLeagues` — admin can see all leagues across the platform (including leagues they're not a member of)
  - [x] Test: `league.getAllLeagues` — non-admin receives `FORBIDDEN`
  - [x] Test: `league.getAllLeagues` — returns correct commissioner and participantCount fields
  - [x] Test: `admin.recalculateDraftOrder` — admin receives `{ status: "not_available" }` response
  - [x] Test: `admin.recalculateDraftOrder` — non-admin receives `FORBIDDEN`
  - [x] Test: `admin.recalculateDraftOrder` — throws `NOT_FOUND` for non-existent leagueId
  - [x] Run `pnpm test` — all tests pass (32/32)
  - [x] Cleanup in `afterEach`: participants → leagues → users (FK order), `test-admin-` prefix

- [x] Task 7: Run `pnpm lint` and `pnpm typecheck` — zero errors (AC: all)
  - [x] `pnpm typecheck` — 0 errors
  - [x] `SKIP_ENV_VALIDATION=true pnpm lint` — 0 errors (also fixed lint error in auth/config.ts from dev-login feature)

## Dev Notes

### Scope Notes — What's In / Out for Epic 2

- **In scope**: Read-only cross-league view (AC1), scaffolded recalculate button (AC2), access control (AC3), tests (AC4)
- **Out of scope / deferred to Epic 3**: Real draft order calculation logic — `recalculateDraftOrder` returns a stub response; the actual recalculation service is built in Story 3.3 (Draft Order Generation)
- **AC3 (preference list privacy)**: Preference list router doesn't exist in Epic 2 — naturally satisfied. No test needed; note will be carried forward to Epic 3 story.

### `getAllLeagues` — Full Procedure

Add to `src/server/api/routers/league.ts` after `getMyLeagues`:

```ts
getAllLeagues: adminProcedure
  .query(async ({ ctx }) => {
    const leagues = await ctx.db.league.findMany({
      include: {
        participants: {
          where: { isCommissioner: true },
          include: {
            user: { select: { id: true, name: true, email: true } },
          },
          take: 1,
        },
        _count: { select: { participants: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return leagues.map((league) => {
      const commParticipant = league.participants[0];
      return {
        leagueId: league.id,
        leagueName: league.name,
        seriesId: league.seriesId,
        participantCount: league._count.participants,
        commissioner: commParticipant
          ? {
              userId: commParticipant.user.id,
              name: commParticipant.user.name,
              email: commParticipant.user.email,
            }
          : null,
      };
    });
  }),
```

**Important**: `adminProcedure` is already exported from `~/server/api/trpc` — add to imports at top of `league.ts`.

Do NOT expose `inviteToken` — it is not included in the `league.findMany` select above.

### `admin.ts` Router — Full Implementation

```ts
// src/server/api/routers/admin.ts
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createTRPCRouter, adminProcedure } from "~/server/api/trpc";

export const adminRouter = createTRPCRouter({
  recalculateDraftOrder: adminProcedure
    .input(z.object({ leagueId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const league = await ctx.db.league.findUnique({
        where: { id: input.leagueId },
        select: { id: true },
      });
      if (!league) {
        throw new TRPCError({ code: "NOT_FOUND", message: "League not found" });
      }
      // Epic 3 (Story 3.3) will replace this stub with real draft order logic
      return {
        status: "not_available" as const,
        message: "Draft order calculation requires Epic 3",
      };
    }),
});
```

### Admin Page — Full Implementation

```tsx
// src/app/admin/page.tsx
import { redirect } from "next/navigation";

import { auth } from "~/server/auth";
import { createCaller } from "~/server/api/root";
import { db } from "~/server/db";
import { SERIES_STUBS } from "~/lib/constants";
import { RecalculateButton } from "~/components/admin/RecalculateButton";
import { BottomNav } from "~/components/shared/BottomNav";

export default async function AdminPage() {
  const session = await auth();
  if (!session) redirect("/sign-in");

  if (session.user.role !== "admin") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-50">
        <p className="text-zinc-400">Admin access required.</p>
      </main>
    );
  }

  const caller = createCaller({ db, session, headers: new Headers() });
  const leagues = await caller.league.getAllLeagues();

  return (
    <main className="min-h-screen bg-zinc-950 pb-16 text-zinc-50">
      <div className="mx-auto max-w-3xl px-4 py-6">
        <h1 className="mb-1 text-2xl font-bold text-orange-500">Admin Panel</h1>
        <p className="mb-6 text-sm text-zinc-400">{leagues.length} league{leagues.length !== 1 ? "s" : ""} on platform</p>

        <div className="space-y-3">
          {leagues.map((league) => {
            const seriesName =
              SERIES_STUBS.find((s) => s.id === league.seriesId)?.name ?? league.seriesId;
            const commLabel = league.commissioner?.name ?? league.commissioner?.email ?? "Unknown";
            return (
              <div
                key={league.leagueId}
                className="flex items-center justify-between rounded-xl bg-zinc-900 px-4 py-4"
              >
                <div>
                  <p className="font-semibold text-zinc-100">{league.leagueName}</p>
                  <p className="mt-0.5 text-sm text-zinc-400">{seriesName}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {league.participantCount} participant{league.participantCount !== 1 ? "s" : ""} · Commissioner: {commLabel}
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-600">Phase: Pre-draft</p>
                </div>
                <RecalculateButton leagueId={league.leagueId} leagueName={league.leagueName} />
              </div>
            );
          })}
          {leagues.length === 0 && (
            <p className="py-12 text-center text-zinc-500">No leagues yet.</p>
          )}
        </div>
      </div>
      <BottomNav />
    </main>
  );
}
```

### `RecalculateButton.tsx` — Full Component

```tsx
// src/components/admin/RecalculateButton.tsx
"use client";

import { api } from "~/trpc/react";

interface RecalculateButtonProps {
  leagueId: string;
  leagueName: string;
}

export function RecalculateButton({ leagueId, leagueName }: RecalculateButtonProps) {
  const recalculate = api.admin.recalculateDraftOrder.useMutation({
    onSuccess: (data) => {
      alert(`${leagueName}: ${data.message}`);
    },
    onError: (err) => {
      alert(`Error: ${err.message}`);
    },
  });

  return (
    <button
      type="button"
      onClick={() => recalculate.mutate({ leagueId })}
      disabled={recalculate.isPending}
      className="rounded-lg bg-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-600 disabled:opacity-50"
    >
      {recalculate.isPending ? "Recalculating…" : "Recalculate Draft Order"}
    </button>
  );
}
```

**Note on toast vs alert**: The architecture uses `sonner` for toasts (already in `shadcn/ui`). If `toast` from `sonner` is available in the project, use it instead of `alert()`. Check if `import { toast } from "sonner"` resolves before using — if not, `alert()` is a safe fallback for this admin-only, low-priority MVP screen.

### Integration Tests Pattern — `admin.test.ts`

```ts
// src/server/api/routers/admin.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createCaller } from "~/server/api/root";
import { db, makeSession } from "~/test/helpers";

function makeCaller(userId: string, role: "participant" | "commissioner" | "admin" = "participant") {
  return createCaller({
    db,
    session: makeSession({ id: userId, role }),
    headers: new Headers(),
  });
}

beforeEach(async () => {
  await db.user.upsert({
    where: { id: "test-admin-user1" },
    create: { id: "test-admin-user1", email: "admin@example.com", role: "admin" },
    update: { role: "admin" },
  });
  await db.user.upsert({
    where: { id: "test-admin-user2" },
    create: { id: "test-admin-user2", email: "comm@example.com", role: "commissioner" },
    update: { role: "commissioner" },
  });
});

afterEach(async () => {
  await db.participant.deleteMany({ where: { userId: { startsWith: "test-admin-" } } });
  await db.league.deleteMany({ where: { createdById: { startsWith: "test-admin-" } } });
  await db.user.deleteMany({ where: { id: { startsWith: "test-admin-" } } });
});
```

Key test scenarios:
- `getAllLeagues` with admin role — sees all leagues including those they're not a member of
- `getAllLeagues` with participant/commissioner role — receives FORBIDDEN
- `getAllLeagues` returns correct commissioner and participantCount
- `recalculateDraftOrder` with admin role — returns `{ status: "not_available" }`
- `recalculateDraftOrder` with non-admin role — FORBIDDEN
- `recalculateDraftOrder` with bad leagueId — NOT_FOUND

### Architecture Compliance

- `adminProcedure` is already defined in `~/server/api/trpc` — import it, don't redefine
- Admin page is at `src/app/admin/page.tsx` (flat structure, same as `src/app/dashboard/page.tsx` — NOT under `(auth)/`)
- Role check is double-enforced: tRPC middleware (FORBIDDEN for API calls) + server component role check (inline denial for page access)
- `getAllLeagues` uses `adminProcedure` not `protectedProcedure` — admin-only, not commissioner
- No new Prisma schema changes — all data is accessible from existing `League` + `Participant` + `User` models
- `inviteToken` must NOT appear in `getAllLeagues` response — use explicit `select` or verify the mapped return object omits it

### Previous Story Learnings (Stories 2.1–2.5)

- **Imports**: `adminProcedure` from `~/server/api/trpc`; `createTRPCRouter` same file
- **Server Component pattern**: `createCaller({ db, session, headers: new Headers() })` — same as all prior pages
- **Test cleanup order**: participants → leagues → users (FK constraint order — consistent across all test files)
- **`fileParallelism: false`** already set in `vitest.config.ts` — no change needed
- **Styling**: Cards `bg-zinc-900`, hover `bg-zinc-800`, text `text-zinc-100/400/500`, accent `orange-500`
- **Commissioner procedure uses `commissionerProcedure`** which includes admin. `adminProcedure` is admin-only. Don't confuse them.
- **`SERIES_STUBS`**: `import { SERIES_STUBS } from "~/lib/constants"` — same lookup pattern as dashboard and league home

### Project Structure Notes

**New files:**
- `src/server/api/routers/admin.ts` *(new — adminRouter with recalculateDraftOrder)*
- `src/components/admin/RecalculateButton.tsx` *(new — client component for admin action)*
- `src/app/admin/page.tsx` *(new — admin cross-league panel page)*
- `src/server/api/routers/admin.test.ts` *(new — integration tests)*

**Modified files:**
- `src/server/api/routers/league.ts` *(add `getAllLeagues` procedure + `adminProcedure` import)*
- `src/server/api/root.ts` *(register `admin: adminRouter`)*

### References

- `adminProcedure` definition: [Source: src/server/api/trpc.ts:194-195]
- Admin page route mapping: [Source: architecture.md#Complete Project Directory Structure — app/admin/page.tsx (FR5)]
- FR5: "Admin can view cross-league data and take corrective actions": [Source: epics.md#Story 2.6]
- RBAC enforcement at API layer, not UI: [Source: architecture.md#Implementation Patterns — RBAC Enforcement]
- Story 3.3 (Draft Order Generation) will replace the stub in `recalculateDraftOrder`: [Source: sprint-status.yaml — 3-3-draft-order-generation: backlog]
- `enforceOwner` for preference list privacy (AC3 future enforcement): [Source: src/server/api/trpc.ts:172-179]

## Senior Developer Review (AI)

**Review Date:** 2026-03-15
**Reviewer Model:** claude-opus-4-6
**Review Outcome:** Approve (after fixes)

**Findings:** 1 High, 3 Medium, 2 Low

### Action Items

- [x] [HIGH] `getAllLeagues` uses `include` which fetches `inviteToken` into server memory — Fixed: switched to explicit `select` on the League model, only fetching `id`, `name`, `seriesId`, `createdAt`
- [x] [MED] Admin page has no navigation link — unreachable without manually typing `/admin` — Fixed: added optional `isAdmin` prop to `BottomNav`, passed from admin page and dashboard
- [x] [MED] Test assertion `toBeGreaterThanOrEqual(1)` is weak — Fixed: removed weak length check, kept specific `find` + `toBeDefined` + `toBeTruthy` assertions
- [x] [MED] `RecalculateButton` uses blocking `alert()` — Fixed: replaced with inline state-driven feedback that auto-clears after 3 seconds
- [ ] [LOW] Admin page uses `max-w-3xl` inconsistent with rest of app (`max-w-xl`) — Accepted: admin panel benefits from wider view for tabular league data
- [ ] [LOW] `leagueName` prop in `RecalculateButton` only used in feedback message — Accepted: retained for feedback context, will be useful when real recalculation is implemented in Epic 3

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Lint error fixed in `src/server/auth/config.ts` (from dev-login feature added earlier): `@typescript-eslint/no-base-to-string` on `String(credentials.email)` — fixed by using `credentials.email as string` after the null guard.

### Completion Notes List

- All 7 tasks completed. 32/32 tests pass (6 new in `admin.test.ts`).
- `getAllLeagues` added to `league.ts` using `adminProcedure` — returns all leagues platform-wide with commissioner info and participant count; `inviteToken` is not exposed.
- `adminRouter` created with `recalculateDraftOrder` stub — verifies league exists (NOT_FOUND guard), returns `{ status: "not_available", message: "Draft order calculation requires Epic 3" }`.
- Admin router registered in `root.ts` as `admin: adminRouter`.
- `src/app/admin/page.tsx` — server component, double access control (redirect for unauthenticated, inline denial for non-admin), lists all leagues with commissioner/participant count/series/phase.
- `RecalculateButton.tsx` — client island using `api.admin.recalculateDraftOrder.useMutation()` with inline state-driven feedback (auto-clears after 3s).
- 6 integration tests cover: admin sees all leagues (including non-membership), FORBIDDEN for participant/commissioner, correct fields returned, stub response for recalculate, FORBIDDEN for non-admin on recalculate, NOT_FOUND for bad leagueId.
- Code review fixes: `getAllLeagues` switched to explicit `select` to avoid fetching `inviteToken`; `BottomNav` gained `isAdmin` prop for admin navigation; weak test assertion removed; `alert()` replaced with inline feedback.

### File List

- `src/server/api/routers/league.ts` (modified — added `getAllLeagues` procedure with `select` + `adminProcedure` import)
- `src/server/api/routers/admin.ts` (new — adminRouter with recalculateDraftOrder stub)
- `src/server/api/root.ts` (modified — registered `admin: adminRouter`)
- `src/app/admin/page.tsx` (new — admin cross-league panel page)
- `src/components/admin/RecalculateButton.tsx` (new — client component with inline feedback)
- `src/components/shared/BottomNav.tsx` (modified — added optional `isAdmin` prop for admin nav link)
- `src/app/dashboard/page.tsx` (modified — passes `isAdmin` to `BottomNav`)
- `src/server/api/routers/admin.test.ts` (new — 6 integration tests)
- `src/server/auth/config.ts` (modified — lint fix: `String(credentials.email)` → `credentials.email as string`)
