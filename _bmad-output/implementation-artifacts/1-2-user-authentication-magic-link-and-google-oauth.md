# Story 1.2: User Authentication — Magic Link & Google OAuth

Status: in-progress

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to register and sign in using a magic link sent to my email or my Google account,
so that I can access the platform securely without managing a password.

## Acceptance Criteria

1. **Given** I visit the app unauthenticated, **when** I enter my email on the sign-in page and submit, **then** I receive a magic link email and a confirmation message is shown in the UI.

2. **Given** I have received a magic link email, **when** I click the link, **then** I am authenticated and redirected to the dashboard (or original destination).

3. **Given** I visit the app unauthenticated, **when** I click "Sign in with Google", **then** I am redirected through the Google OAuth flow and on success am signed in and redirected to the dashboard.

4. **Given** I am authenticated, **when** I navigate to any app route, **then** my session is maintained and I am not redirected to sign-in.

5. **Given** I am unauthenticated, **when** I attempt to access any auth-gated route directly (anything except `/sign-in`, `/api/auth/*`, and static assets), **then** I am redirected to `/sign-in`.

6. **Given** I am on the sign-in page, **when** the page loads, **then** the dark theme (zinc-950 background, zinc-900 card, orange-500 accent) and Inter font are applied — the page does not use the T3 boilerplate purple/violet theme.

## Tasks / Subtasks

- [x] Task 1: Install nodemailer peer dependency (AC: #1, #2)
  - [x] Run `pnpm add nodemailer@^6.9.16` and `pnpm add -D @types/nodemailer` — installed nodemailer 6.10.1 (v6 required; next-auth beta.25 peer dep is ^6.6.5)
  - [x] Confirm `pnpm typecheck` still passes after install ✅

- [x] Task 2: Configure NextAuth providers in `src/server/auth/config.ts` (AC: #1, #2, #3)
  - [x] Import `Nodemailer` from `"next-auth/providers/nodemailer"` — conditionally registered when all AUTH_EMAIL_SERVER_* vars are set
  - [x] Import `Google` from `"next-auth/providers/google"` — conditionally registered when AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET are set
  - [x] Add `pages: { signIn: "/sign-in" }` to config ✅
  - [x] Keep existing `adapter: PrismaAdapter(db)` and `session` callback ✅
  - [x] Updated `src/env.js`: email vars required in production, optional in dev (same pattern as AUTH_SECRET)

- [x] Task 3: Create custom sign-in page `src/app/sign-in/page.tsx` (AC: #1, #3, #6)
  - [x] Client Component with controlled email state, loading state, and sent state
  - [x] Email form calls `signIn("nodemailer", { email, redirect: false, callbackUrl: "/dashboard" })`
  - [x] Google button calls `signIn("google", { callbackUrl: "/dashboard" })`
  - [x] Dark theme: `bg-zinc-950` page, `bg-zinc-900` card, `text-orange-500` heading ✅
  - [x] Loading state: button disabled + "Sending…" / "Sign in with Google" text ✅
  - [x] Success state: "Check your email" with email address displayed ✅

- [x] Task 4: Create `src/middleware.ts` for auth route protection (AC: #4, #5)
  - [x] Export `auth as middleware` from `~/server/auth` ✅
  - [x] Matcher excludes `/sign-in`, `/api/auth/*`, `/_next/static`, `/_next/image`, `/favicon.ico`, `/manifest.json`, `/icons/*` ✅

- [ ] Task 5: Set `AUTH_URL` in Railway environment (AC: #2, #3)
  - [ ] Add `AUTH_URL=https://web-production-22716.up.railway.app` to **web** service Railway variables
  - [ ] Add same `AUTH_URL` to **worker** service Railway variables
  - [ ] Trigger Railway redeploy and confirm app is live

- [ ] Task 6: Verify magic link flow end-to-end (AC: #1, #2, #4, #5)
  - [ ] `pnpm dev` — confirm unauthenticated visit redirects to `/sign-in`
  - [ ] Enter email on sign-in page — confirm success message appears
  - [ ] Click magic link in email — confirm redirect and session established
  - [ ] Confirm session persists on page navigation

- [x] Task 7: Run `pnpm lint` and `pnpm typecheck` — zero errors (AC: all)
  - [x] `pnpm typecheck` — 0 errors ✅
  - [x] `SKIP_ENV_VALIDATION=true pnpm lint` — 0 errors ✅ (CI runs lint with SKIP_ENV_VALIDATION)

## Dev Notes

### Critical: next-auth v5 Provider Import Paths

This project uses **next-auth v5.0.0-beta.25** — the API is significantly different from v4. Use v5 import paths only:

```ts
// ✅ CORRECT (v5 paths)
import Nodemailer from "next-auth/providers/nodemailer"
import Google from "next-auth/providers/google"

// ❌ WRONG (v4 paths — do not use)
import EmailProvider from "next-auth/providers/email"
import GoogleProvider from "next-auth/providers/google-provider"
```

The v5 `Nodemailer` provider name is important: NextAuth v5 renamed `email` → `nodemailer` to be explicit about the dependency. Using `"email"` as the provider ID in `signIn()` calls will fail — use `"nodemailer"`.

### Critical: nodemailer Is NOT Included in next-auth

`nodemailer` is a peer dependency that must be installed separately:
```bash
pnpm add nodemailer
pnpm add -D @types/nodemailer
```

Without this, `next-auth/providers/nodemailer` will throw a runtime error.

### auth/config.ts — Full Updated Implementation

The file already has `PrismaAdapter`, session callback, and `satisfies NextAuthConfig`. Only add to `providers: []`:

```ts
import { PrismaAdapter } from "@auth/prisma-adapter";
import { type DefaultSession, type NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import Nodemailer from "next-auth/providers/nodemailer";

import { env } from "~/env";
import { db } from "~/server/db";

export const authConfig = {
  providers: [
    Nodemailer({
      server: {
        host: env.AUTH_EMAIL_SERVER_HOST,
        port: Number(env.AUTH_EMAIL_SERVER_PORT ?? "587"),
        auth: {
          user: env.AUTH_EMAIL_SERVER_USER,
          pass: env.AUTH_EMAIL_SERVER_PASSWORD,
        },
      },
      from: env.AUTH_EMAIL_FROM,
    }),
    ...(env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET
      ? [Google({ clientId: env.AUTH_GOOGLE_ID, clientSecret: env.AUTH_GOOGLE_SECRET })]
      : []),
  ],
  adapter: PrismaAdapter(db),
  pages: {
    signIn: "/sign-in",
  },
  callbacks: {
    session: ({ session, user }) => ({
      ...session,
      user: {
        ...session.user,
        id: user.id,
      },
    }),
  },
} satisfies NextAuthConfig;
```

**Why conditional Google:** If `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET` are not set in env, the Google provider is not registered. This means the Google button must either always be shown (and fail gracefully if not configured) or be conditionally rendered. The simplest approach for Story 1.2: always render the Google button in the UI — if not configured, it will fail with a meaningful error. A `NEXT_PUBLIC_GOOGLE_OAUTH_ENABLED` var can be added in Story 1.3+ if needed.

### env.js — Env Var Changes Required

The `AUTH_EMAIL_SERVER_*` and `AUTH_GOOGLE_*` vars are already defined in `src/env.js` as optional. For Story 1.2, make `AUTH_EMAIL_SERVER_HOST`, `AUTH_EMAIL_SERVER_PORT`, `AUTH_EMAIL_SERVER_USER`, `AUTH_EMAIL_SERVER_PASSWORD`, and `AUTH_EMAIL_FROM` required (not optional) since magic link is the primary auth method:

```ts
// In server section of src/env.js:
AUTH_EMAIL_SERVER_HOST: z.string(),      // was .optional()
AUTH_EMAIL_SERVER_PORT: z.string(),      // was .optional()
AUTH_EMAIL_SERVER_USER: z.string(),      // was .optional()
AUTH_EMAIL_SERVER_PASSWORD: z.string(),  // was .optional()
AUTH_EMAIL_FROM: z.string(),             // was .optional()
```

**WARNING:** After this change, `pnpm build` will fail if these vars are not set. The Dockerfile already uses `SKIP_ENV_VALIDATION=1` so builds on Railway will still pass. Local dev requires these vars in `.env`.

### Middleware Configuration

```ts
// src/middleware.ts
export { auth as middleware } from "~/server/auth";

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     * - /sign-in (public auth page)
     * - /api/auth/* (NextAuth endpoints)
     * - /_next/static (static files)
     * - /_next/image (image optimization)
     * - /favicon.ico, /manifest.json, /icons/* (PWA assets)
     */
    "/((?!sign-in|api/auth|_next/static|_next/image|favicon.ico|manifest.json|icons).*)",
  ],
};
```

**Important:** The default NextAuth v5 middleware behavior when no callback is provided: redirects unauthenticated requests to the configured `pages.signIn` URL. This is exactly what we want.

### Sign-in Page Design

Follow the dark theme from the UX spec. Do NOT use the T3 boilerplate purple gradient. Use:
- Page: `min-h-screen bg-zinc-950 flex items-center justify-center`
- Card: `bg-zinc-900 rounded-xl p-8 w-full max-w-sm`
- Heading: `text-orange-500 font-bold text-2xl`
- Primary button: `bg-orange-500 hover:bg-orange-600 text-white`
- Input: `bg-zinc-800 border-zinc-700 text-white`
- Divider: `text-zinc-500` with "or" separator
- Google button: outlined variant — `border border-zinc-700 bg-zinc-900 text-white hover:bg-zinc-800`

The sign-in page is a `"use client"` component. Use `useState` for email, loading, and success states. Import `signIn` from `"next-auth/react"` (client-side, not server-side).

```ts
// Client-side signIn (in "use client" component)
import { signIn } from "next-auth/react";

// NOT this (server-side, only in Server Components/Actions)
import { signIn } from "~/server/auth";
```

### AUTH_URL Requirement

NextAuth v5 requires `AUTH_URL` (or `NEXTAUTH_URL`) in production to construct callback URLs for magic links and OAuth redirects. Without it, magic link emails will contain `localhost` callback URLs.

Set in Railway web service variables:
```
AUTH_URL=https://web-production-22716.up.railway.app
```

This must exactly match the Railway domain. Do not add a trailing slash.

### Prisma Schema — Already Correct

The T3 starter schema already has all models needed for NextAuth:
- `User` — id, email, emailVerified, accounts, sessions
- `Account` — OAuth accounts (for Google)
- `Session` — JWT sessions
- `VerificationToken` — magic link tokens

No schema changes needed in Story 1.2.

### Route Structure

No new route group needed for Story 1.2. The sign-in page lives at `src/app/sign-in/page.tsx` (not inside an auth-gated group). The middleware handles protection of all other routes.

```
src/app/
  sign-in/
    page.tsx      ← NEW (public, unauthenticated)
  layout.tsx      ← existing
  page.tsx        ← existing T3 boilerplate (not yet replaced — Story 1.4)
  api/
    auth/
      [...nextauth]/
        route.ts  ← existing (no changes needed)
```

### Previous Story Context

Story 1.1 left `src/server/auth/config.ts` with an empty `providers: []` array and a comment: "Auth providers configured in Story 1.2". This is the exact file to modify.

Story 1.1 also set these Railway variables (from code review): `AUTH_EMAIL_FROM`, `AUTH_EMAIL_SERVER_HOST`, `AUTH_EMAIL_SERVER_PORT`, `AUTH_EMAIL_SERVER_USER`, plus `AUTH_SECRET`. Google OAuth vars (`AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`) were set as empty strings — they will need real values from Google Cloud Console for Google OAuth to work.

### Google Cloud Console Setup (Manual — HALT if needed)

For Google OAuth to work, Todd must create OAuth credentials:
1. Go to [console.cloud.google.com](https://console.cloud.google.com) → APIs & Services → Credentials
2. Create OAuth 2.0 Client ID (Web application)
3. Add authorized redirect URIs:
   - `https://web-production-22716.up.railway.app/api/auth/callback/google` (production)
   - `http://localhost:3001/api/auth/callback/google` (local dev — adjust port as needed)
4. Copy Client ID → `AUTH_GOOGLE_ID`, Client Secret → `AUTH_GOOGLE_SECRET` in Railway + local `.env`

If Google credentials are not available, Google OAuth can be deferred. Magic link is the primary auth method (FR41) and is sufficient to complete this story.

### Architecture Anti-Patterns to Avoid

- ❌ Do NOT use `signIn` from `~/server/auth` in a client component — use `signIn` from `"next-auth/react"`
- ❌ Do NOT import `next-auth/providers/email` — use `next-auth/providers/nodemailer` (v5)
- ❌ Do NOT add RBAC logic in this story — that's Story 1.3
- ❌ Do NOT replace or remove the T3 boilerplate `page.tsx` or its tRPC queries — that's Story 1.4
- ❌ Do NOT add `SessionProvider` to `layout.tsx` — not needed for Next.js App Router with server-side `auth()` usage; only needed if adding client-side `useSession()` hooks (Story 1.4+)
- ❌ Do NOT modify `src/app/api/auth/[...nextauth]/route.ts` — it already exports `{ GET, POST }` from handlers correctly

### References

- next-auth v5 Nodemailer provider: [Source: architecture.md#Authentication & Security]
- Magic link primary auth: [Source: epics.md#FR41 + architecture.md#Auth method]
- Google OAuth optional: [Source: architecture.md#External Integration Points]
- JWT sessions: [Source: architecture.md#Authentication & Security — Session management]
- Middleware auth gating (all routes): [Source: architecture.md#Security Requirements — NFR-SEC-2]
- Dark theme (zinc-950/900, orange-500): [Source: architecture.md#Additional Requirements — From UX Design]
- Custom sign-in page: [Source: ux-design-specification.md#Critical Success Moments — First pick as new user]
- PrismaAdapter already wired: [Source: Story 1.1 completion notes — auth/config.ts]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- **nodemailer version conflict:** next-auth@5.0.0-beta.25 requires nodemailer@^6.6.5. nodemailer v8 was installed first (latest) — caused peer dep warning. Downgraded to v6.10.1 to satisfy next-auth's peer requirement. @auth/prisma-adapter 2.11.1 has a transitive dep on nodemailer@^7.0.7 via @auth/core@0.41.1 but this does not affect actual email sending (which uses next-auth's nodemailer provider directly).
- **env.js required vs optional:** Making email vars required broke `pnpm lint` locally since env validation runs at lint time. Applied production-conditional pattern (same as AUTH_SECRET): required in production, optional in local dev. Email provider is also conditionally registered in auth/config.ts when vars are present.

### Completion Notes List

- **Tasks 1–4, 7 COMPLETE** — All automated tasks done: nodemailer installed (v6.10.1), NextAuth providers configured (conditional Nodemailer + conditional Google), custom sign-in page created (dark theme, email form, Google button, loading/success states), middleware created and protecting all routes. Lint and typecheck pass.
- **Tasks 5–6 HALT** — Require manual Railway + email verification (see HALT section below)

### HALT — Manual Steps Required

**Task 5 — Set AUTH_URL in Railway:**
```
AUTH_URL=https://web-production-22716.up.railway.app
```
Add to both **web** and **worker** services in Railway dashboard → Variables. Without this, magic link callback URLs in emails will point to localhost.

**Task 6 — Verify end-to-end flows:**
1. `pnpm dev` → visit `localhost:3001` → confirm redirect to `/sign-in`
2. Enter email → confirm "Check your email" success message appears
3. Click magic link in email → confirm authenticated session + redirect to home/dashboard
4. Confirm session persists across page navigation
5. Confirm Google OAuth works if `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET` are set

### File List

- `package.json` *(modified — nodemailer@6.10.1 added as dependency, @types/nodemailer as devDependency)*
- `pnpm-lock.yaml` *(modified — lockfile updated)*
- `src/env.js` *(modified — email vars changed from optional to production-conditional required)*
- `src/server/auth/config.ts` *(modified — added Nodemailer + Google providers, pages config)*
- `src/app/sign-in/page.tsx` *(new — custom dark-theme sign-in page)*
- `src/middleware.ts` *(new — auth route protection, exports auth as middleware)*

## Change Log

- 2026-03-09: Story created — comprehensive context with next-auth v5 specifics, nodemailer peer dep, provider import paths, conditional Google OAuth, middleware config, sign-in page design spec, AUTH_URL requirement (Agent: claude-sonnet-4-6)
- 2026-03-09: Implementation — Tasks 1-4, 7 complete; nodemailer v6.10.1 installed, providers configured conditionally, sign-in page and middleware created; Tasks 5-6 HALT pending Railway AUTH_URL + end-to-end email verification (Agent: claude-sonnet-4-6)
