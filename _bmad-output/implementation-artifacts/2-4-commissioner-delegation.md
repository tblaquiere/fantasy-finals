# Story 2.4: Commissioner Delegation

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a commissioner,
I want to transfer the commissioner role to another participant,
so that I can hand off management to someone else.

## Acceptance Criteria

1. **Given** I am the commissioner of a league with at least one other participant, **when** I select another participant and confirm delegation, **then** that participant's `isCommissioner` flag is updated to `true` AND my `isCommissioner` flag is updated to `false` AND the change takes effect immediately (DB is updated atomically, new commissioner gains league-scoped permissions on next action).

2. **Given** the new commissioner is now active, **when** they access commissioner-only controls, **then** those controls are available and functional (subject to the MVP JWT staleness limitation noted in Dev Notes).

3. **Given** I try to delegate to a user who is not a participant of this league, **when** the mutation runs, **then** it returns `NOT_FOUND`.

4. **Given** Vitest is configured, **when** `pnpm test` is run, **then** the `league.delegateCommissioner` procedure is covered by integration tests using a real database connection.

## Tasks / Subtasks

- [x] Task 1: Add `delegateCommissioner` mutation to league router (AC: #1, #2, #3)
  - [x] Add `delegateCommissioner` — `commissionerProcedure`, input: `{ leagueId: z.string(), newCommissionerId: z.string() }`
  - [x] Call `enforceLeagueCommissioner` to verify caller is commissioner of THIS league
  - [x] Fetch target participant: `db.participant.findUnique({ where: { userId_leagueId: { userId: input.newCommissionerId, leagueId: input.leagueId } } })`; throw `NOT_FOUND` if missing
  - [x] Throw `BAD_REQUEST` if target is already the commissioner (`targetParticipant.isCommissioner === true`)
  - [x] Wrap all DB writes in `$transaction`:
    - Set target participant `isCommissioner = true`
    - Set caller participant `isCommissioner = false`
    - Promote target `User.role = "commissioner"` in DB
    - Count caller's remaining `isCommissioner: true` participants (excluding this league); if 0, demote caller `User.role = "participant"` in DB
  - [x] Return `{ success: true }`
  - [x] Run `pnpm typecheck` — zero errors

- [x] Task 2: Create `src/components/league/CommissionerControls.tsx` — delegation UI (AC: #1, #2)
  - [x] `"use client"` — interactivity required for select and confirmation
  - [x] Props: `leagueId: string`, `participants: Array<{ userId: string; name: string | null; email: string | null; isCommissioner: boolean }>`
  - [x] Derive `nonCommissioners` = participants filtered to `!isCommissioner`
  - [x] Render select `<select>` of non-commissioner participants (value = `userId`)
  - [x] "Transfer" button: disabled if no participant selected or mutation pending
  - [x] On click: `window.confirm("Transfer commissioner role to [name]? You will become a regular participant.")` — only proceed if confirmed
  - [x] Call `api.league.delegateCommissioner.useMutation()` with `{ leagueId, newCommissionerId: selectedUserId }`
  - [x] On success: show confirmation message "Commissioner role transferred. The new commissioner will need to sign out and back in to access all commissioner controls."
  - [x] On error: show `mutation.error.message` in red text
  - [x] Run `pnpm typecheck` — zero errors

- [x] Task 3: Update `src/app/league/[leagueId]/settings/page.tsx` to add delegation section (AC: #1, #2)
  - [x] Fetch participant list via `caller.league.getLeague({ leagueId })` for participants — wrapped in try/catch, falls back to empty list on error
  - [x] Add a "Transfer Commissioner" card/section below the Invite Link card on the settings page
  - [x] Render `<CommissionerControls leagueId={leagueId} participants={...} />` (only if there are other participants to delegate to)
  - [x] If only 1 participant (the commissioner alone), render: `<p>Add participants to your league before delegating.</p>`
  - [x] Run `pnpm typecheck` — zero errors

- [x] Task 4: Write Vitest integration tests for `delegateCommissioner` (AC: #4)
  - [x] Create `src/server/api/routers/league-delegate.test.ts`
  - [x] Test: commissioner successfully delegates — target `isCommissioner` becomes `true`, caller `isCommissioner` becomes `false`, target `User.role` updated to `commissioner`
  - [x] Test: caller's `User.role` demoted to `participant` when they have no other commissioner roles after delegation
  - [x] Test: caller's `User.role` stays `commissioner` when they still have another commissioner role in a different league
  - [x] Test: throws `NOT_FOUND` when target is not a participant of this league
  - [x] Test: throws `FORBIDDEN` when non-commissioner tries to delegate
  - [x] Run `pnpm test` — all tests pass

- [x] Task 5: Run `pnpm lint` and `pnpm typecheck` — zero errors (AC: all)
  - [x] `pnpm typecheck` — 0 errors
  - [ ] `SKIP_ENV_VALIDATION=true pnpm lint` — 0 errors

## Dev Notes

### JWT Staleness — MVP Limitation

**This is the most important caveat for this story.** The `commissionerProcedure` middleware checks `ctx.session.user.role` (from JWT), not the DB. After delegation:

- **Old commissioner**: JWT still says `commissioner` → can still ENTER `commissionerProcedure` routes BUT `enforceLeagueCommissioner` blocks them since their `isCommissioner` DB flag is now `false`. This is defense-in-depth working correctly.
- **New commissioner**: JWT still says `participant` → `commissionerProcedure` middleware REJECTS them until they sign out and back in.

This is an **explicitly accepted MVP limitation** per architecture.md: "JWT role is stale until next sign-in — acceptable for MVP."

**The success message in `CommissionerControls.tsx` must inform the user:** "The new commissioner will need to sign out and back in to access all commissioner controls."

### `delegateCommissioner` Procedure — Full Implementation

```ts
delegateCommissioner: commissionerProcedure
  .input(z.object({ leagueId: z.string(), newCommissionerId: z.string() }))
  .mutation(async ({ ctx, input }) => {
    const isAdmin = ctx.session.user.role === "admin";
    await enforceLeagueCommissioner(ctx.db, ctx.session.user.id, input.leagueId, isAdmin);

    // Verify target is a participant of this league
    const targetParticipant = await ctx.db.participant.findUnique({
      where: { userId_leagueId: { userId: input.newCommissionerId, leagueId: input.leagueId } },
    });
    if (!targetParticipant) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Target user is not a participant of this league" });
    }
    if (targetParticipant.isCommissioner) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "User is already the commissioner" });
    }

    await ctx.db.$transaction(async (tx) => {
      // Flip isCommissioner on participant records
      await tx.participant.update({
        where: { userId_leagueId: { userId: input.newCommissionerId, leagueId: input.leagueId } },
        data: { isCommissioner: true },
      });
      await tx.participant.update({
        where: { userId_leagueId: { userId: ctx.session.user.id, leagueId: input.leagueId } },
        data: { isCommissioner: false },
      });

      // Promote new commissioner's User.role in DB
      await tx.user.update({
        where: { id: input.newCommissionerId },
        data: { role: "commissioner" },
      });

      // Demote old commissioner's User.role only if they have no other commissioner roles
      const remainingCommissionerRoles = await tx.participant.count({
        where: {
          userId: ctx.session.user.id,
          isCommissioner: true,
          leagueId: { not: input.leagueId },
        },
      });
      if (remainingCommissionerRoles === 0) {
        await tx.user.update({
          where: { id: ctx.session.user.id },
          data: { role: "participant" },
        });
      }
    });

    return { success: true };
  }),
```

**Note:** Admin users bypass `enforceLeagueCommissioner` but can still run this mutation. Admin delegating from their own session would not make sense contextually, but the code allows it. This is acceptable for MVP — admin operations go through the admin panel in a later story.

### `CommissionerControls.tsx` — Full Component

```tsx
// src/components/league/CommissionerControls.tsx
"use client";

import { useState } from "react";
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";

interface Participant {
  id: string;
  userId: string;
  name: string | null;
  email: string | null;
  isCommissioner: boolean;
}

interface CommissionerControlsProps {
  leagueId: string;
  participants: Participant[];
}

export function CommissionerControls({ leagueId, participants }: CommissionerControlsProps) {
  const nonCommissioners = participants.filter((p) => !p.isCommissioner);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [transferred, setTransferred] = useState(false);

  const delegate = api.league.delegateCommissioner.useMutation({
    onSuccess: () => setTransferred(true),
  });

  if (nonCommissioners.length === 0) {
    return (
      <p className="text-sm text-zinc-500">Add participants to your league before delegating.</p>
    );
  }

  if (transferred) {
    return (
      <p className="text-sm text-green-400">
        Commissioner role transferred. The new commissioner will need to sign out and back in to
        access all commissioner controls.
      </p>
    );
  }

  const selectedParticipant = nonCommissioners.find((p) => p.userId === selectedUserId);
  const displayName = (p: Participant) => p.name ?? p.email ?? p.userId;

  const handleTransfer = () => {
    if (!selectedUserId) return;
    const name = selectedParticipant ? displayName(selectedParticipant) : "this participant";
    if (confirm(`Transfer commissioner role to ${name}? You will become a regular participant.`)) {
      delegate.mutate({ leagueId, newCommissionerId: selectedUserId });
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-zinc-400">
        Transfer your commissioner role to another participant.
      </p>
      <div className="flex gap-2">
        <select
          value={selectedUserId}
          onChange={(e) => setSelectedUserId(e.target.value)}
          className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-300 focus:border-orange-500 focus:outline-none"
        >
          <option value="">Select participant…</option>
          {nonCommissioners.map((p) => (
            <option key={p.userId} value={p.userId}>
              {displayName(p)}
            </option>
          ))}
        </select>
        <Button
          onClick={handleTransfer}
          disabled={!selectedUserId || delegate.isPending}
          variant="destructive"
          className="shrink-0"
        >
          {delegate.isPending ? "Transferring…" : "Transfer"}
        </Button>
      </div>
      {delegate.isError && (
        <p className="text-sm text-red-400">{delegate.error.message}</p>
      )}
    </div>
  );
}
```

**Note on `Button` variant:** Use `variant="destructive"` since delegation is irreversible (commissioner loses their role). If `destructive` variant doesn't exist in the installed shadcn components, use `className="bg-red-600 text-white hover:bg-red-700"` instead. Check `src/components/ui/button.tsx` first.

### Settings Page — How to Fetch Participants

The settings page currently calls `getInviteToken` (commissioner-only) and renders `InviteLink`. For Story 2.4, it also needs the participant list. Use the existing `getLeague` call which already returns participants:

```tsx
// In LeagueSettingsPage — add after the existing token fetch:
const leagueData = await caller.league.getLeague({ leagueId });
```

`getLeague` requires membership (which the commissioner has). It returns `participants` with `user.name`, `user.email`, and `isCommissioner`. Pass these to `CommissionerControls`.

However, be aware: `getLeague` returns participants with shape `{ id, userId, leagueId, isCommissioner, joinedAt, user: { id, name, email } }`. The `CommissionerControls` component needs `{ id, userId, name, email, isCommissioner }`. Map the shape when passing: `leagueData.participants.map(p => ({ ...p, name: p.user.name, email: p.user.email }))`.

The settings page FORBID check already exists for non-commissioners. Adding `getLeague` call won't break this — commissioners are always members, so `getLeague` will succeed.

### Test Setup — Commissioner Delegation Tests

Requires two distinct test users with different roles. The caller must have `role: "commissioner"` (for `commissionerProcedure`). The target must be a participant of the league.

```ts
// src/server/api/routers/league-delegate.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TRPCError } from "@trpc/server";
import { createCaller } from "~/server/api/root";
import { db, makeSession } from "~/test/helpers";

function makeCommCaller(userId = "test-comm-id") {
  return createCaller({
    db,
    session: makeSession({ id: userId, role: "commissioner" }),
    headers: new Headers(),
  });
}

let testLeagueId: string;

beforeEach(async () => {
  // Commissioner user
  await db.user.upsert({
    where: { id: "test-comm-id" },
    create: { id: "test-comm-id", email: "comm-delegate@example.com", role: "commissioner" },
    update: { role: "commissioner" },
  });
  // Target participant user
  await db.user.upsert({
    where: { id: "test-target-id" },
    create: { id: "test-target-id", email: "target@example.com", role: "participant" },
    update: { role: "participant" },
  });

  const league = await db.league.create({
    data: {
      name: "Delegation Test League",
      seriesId: "2025-wc1-okc-memphis",
      clockDurationMinutes: 30,
      inviteToken: "test-token-delegate",
      createdById: "test-comm-id",
      participants: {
        createMany: {
          data: [
            { userId: "test-comm-id", isCommissioner: true },
            { userId: "test-target-id", isCommissioner: false },
          ],
        },
      },
    },
  });
  testLeagueId = league.id;
});

afterEach(async () => {
  await db.participant.deleteMany({ where: { userId: { startsWith: "test-" } } });
  await db.league.deleteMany({ where: { createdById: { startsWith: "test-" } } });
  await db.user.deleteMany({ where: { id: { startsWith: "test-" } } });
});
```

### Architecture Anti-Patterns to Avoid

- Do NOT skip the atomic transaction — `isCommissioner` swap must be atomic; partial state (both flagged, or neither) is invalid
- Do NOT blindly demote `User.role` without checking other leagues — a multi-league commissioner who delegates one league should stay `commissioner` globally
- Do NOT check JWT `ctx.session.user.role` to determine display in the UI — always check `participant.isCommissioner` from the league data, not the JWT
- Do NOT import `@prisma/client` — always `"generated/prisma"`
- Do NOT use `params.leagueId` directly in Next.js 15 pages — always `await params`
- Do NOT call `api.league.*` hooks in Server Components — only `"use client"` components

### Previous Story Learnings (Stories 2.1–2.3)

- **`enforceLeagueCommissioner()` already exists** in `league.ts` — reuse it, do NOT duplicate the ownership check
- **`commissionerProcedure` + `enforceLeagueCommissioner`**: Always use both — middleware checks global JWT role, helper checks league-specific DB flag
- **`$transaction` pattern**: Already used in `createLeague` and reviewed — multi-step writes must be atomic
- **`commissionerProcedure` tests need `role: "commissioner"`** in session (same as Story 2.2 pattern)
- **Test cleanup order**: participants → leagues → users (FK order)
- **`fileParallelism: false`** already configured in `vitest.config.ts` — sequential test execution prevents FK race conditions
- **`createMany` in Prisma nested write**: Use `participants: { createMany: { data: [...] } }` for seeding multiple participants at once in tests
- **Button `variant="destructive"`**: Check `src/components/ui/button.tsx` for available variants before using

### Project Structure Notes

**New files:**
- `src/components/league/CommissionerControls.tsx` *(new — delegation UI, named per architecture.md)*
- `src/server/api/routers/league-delegate.test.ts` *(new — integration tests)*

**Modified files:**
- `src/server/api/routers/league.ts` *(add `delegateCommissioner` procedure)*
- `src/app/league/[leagueId]/settings/page.tsx` *(add getLeague call + CommissionerControls section)*

### References

- `CommissionerControls.tsx` component location: [Source: architecture.md#Complete Project Directory Structure — components/league/CommissionerControls.tsx]
- FR3: "Commissioner can delegate the commissioner role" [Source: epics.md#Requirements Inventory]
- Commissioner delegation as contextual action: [Source: ux-design-specification.md — "Commissioner controls as contextual actions"]
- JWT staleness limitation: [Source: architecture.md#Authentication & Security — "Note: JWT role is stale until next sign-in — acceptable for MVP"]
- `enforceLeagueCommissioner` helper: [Source: src/server/api/routers/league.ts:12-25]
- `commissionerProcedure` definition: [Source: src/server/api/trpc.ts:186-187]
- Atomic transaction pattern: [Source: src/server/api/routers/league.ts — createLeague `$transaction`]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None — implementation proceeded without errors.

### Completion Notes List

- All 5 tasks completed successfully.
- `delegateCommissioner` mutation added to `league.ts` using `commissionerProcedure` + `enforceLeagueCommissioner` + `$transaction` for atomicity.
- Multi-league demotion guard implemented: old commissioner's `User.role` only demoted if they have no other `isCommissioner: true` participant records in other leagues.
- `CommissionerControls.tsx` client component uses `variant="destructive"` Button (confirmed available in `button.tsx`).
- Settings page fetches participant list via existing `getLeague` call wrapped in try/catch (falls back to empty list on error).
- Removed unused `id` field from `Participant` interface in `CommissionerControls.tsx` — component only needs `userId`, `name`, `email`, `isCommissioner`.
- 5 integration tests in `league-delegate.test.ts` — all pass.
- `pnpm typecheck` and `SKIP_ENV_VALIDATION=true pnpm lint` — zero errors.
- Code review fixes applied: HIGH-1 (getLeague try/catch), MED-1 (task checkboxes), MED-2 (model name), MED-3 (unused id field).

### File List

- `src/server/api/routers/league.ts` *(modified — added `delegateCommissioner` procedure)*
- `src/components/league/CommissionerControls.tsx` *(modified — new file, then updated: removed unused `id` field from Participant interface)*
- `src/app/league/[leagueId]/settings/page.tsx` *(modified — added getLeague call in try/catch + CommissionerControls section)*
- `src/server/api/routers/league-delegate.test.ts` *(new — 5 integration tests)*
