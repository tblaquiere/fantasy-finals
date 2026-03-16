# Story 1.5: FCM Web Push Infrastructure

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to opt in to push notifications so the app can alert me when it's my turn to pick or game events occur,
so that I never miss a draft turn or Mozgov window.

## Acceptance Criteria

1. **Given** I am authenticated and on the dashboard, **when** the notification prompt appears and I click "Enable Notifications", **then** my browser's push permission dialog appears, and on approval my FCM token is saved to the database linked to my user account.

2. **Given** a tRPC procedure or pg-boss job calls `sendNotification()` from `src/server/services/fcm.ts` with a valid FCM token and payload, **when** the send executes, **then** my device receives the notification even if the app is closed, and the service worker displays it.

3. **Given** Firebase Admin credentials are NOT configured in `.env` (local dev or CI), **when** `sendNotification()` is called, **then** it returns `{ ok: true }` and logs a warning — the server never crashes.

4. **Given** I have push notifications enabled, **when** I revoke browser notification permission, **then** subsequent `sendNotification()` calls for my stale token return `{ ok: false, error: "stale-token" }` without throwing, and the caller can delete the token.

5. **Given** the FCM service worker is registered at `/api/firebase-messaging-sw`, **when** the browser requests this endpoint (even without an authenticated session), **then** valid JavaScript is returned with the Firebase config injected from environment variables — no auth redirect.

6. **Given** I click a push notification, **when** the notification click event fires in the service worker, **then** the app opens (or focuses) and navigates to the deep-link URL from `payload.data.link`.

## Tasks / Subtasks

- [x] Task 1: Firebase project setup (external prerequisite — no code changes) (AC: all)
  - [ ] Visit https://console.firebase.google.com → Create a new project (or use an existing one)
  - [ ] In Firebase Console → Project Settings → General → Your apps → Add app → Web — register a web app and copy the config object (apiKey, authDomain, projectId, messagingSenderId, appId)
  - [ ] In Project Settings → Cloud Messaging → Web configuration → Web Push certificates → Generate Key Pair — copy the VAPID public key
  - [ ] In Project Settings → Service accounts → Generate new private key — download the JSON file; extract `project_id`, `client_email`, `private_key`
  - [ ] Add all values to `.env`:
    ```
    NEXT_PUBLIC_FIREBASE_API_KEY="AIzaSy..."
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="your-project.firebaseapp.com"
    NEXT_PUBLIC_FIREBASE_PROJECT_ID="your-project-id"
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID="123456789"
    NEXT_PUBLIC_FIREBASE_APP_ID="1:123456789:web:abc123"
    NEXT_PUBLIC_FIREBASE_VAPID_KEY="BKagOny0KF_2pCJQ3m..."
    FIREBASE_ADMIN_PROJECT_ID="your-project-id"
    FIREBASE_ADMIN_CLIENT_EMAIL="firebase-adminsdk-...@your-project.iam.gserviceaccount.com"
    FIREBASE_ADMIN_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n"
    ```
  - [ ] Note: `FIREBASE_ADMIN_PRIVATE_KEY` must be the full key with literal `\n` escape sequences (not actual newlines) in `.env`

- [x] Task 2: Install Firebase packages (AC: #2, #3)
  - [x] Run `pnpm add firebase firebase-admin`
  - [x] Run `pnpm typecheck` — zero errors

- [x] Task 3: Update `src/env.js` — add VAPID key (AC: #2, #5)
  - [x] Add `NEXT_PUBLIC_FIREBASE_VAPID_KEY: z.string().optional()` to the `client` section
  - [x] Add `NEXT_PUBLIC_FIREBASE_VAPID_KEY: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY` to `runtimeEnv`
  - [x] Run `pnpm typecheck` — zero errors

- [x] Task 4: Add `PushSubscription` Prisma model (AC: #1, #4)
  - [x] Add the `PushSubscription` model to `prisma/schema.prisma` (see Dev Notes for exact schema)
  - [x] Add `pushSubscriptions PushSubscription[]` relation to the `User` model
  - [x] Run `pnpm prisma db push` to apply schema to Railway DB
  - [x] Run `pnpm prisma generate` to regenerate the Prisma client
  - [x] Run `pnpm typecheck` — zero errors

- [x] Task 5: Create `src/server/services/fcm.ts` (AC: #2, #3, #4)
  - [x] Firebase Admin singleton — init once, reuse across requests (see Dev Notes for full implementation)
  - [x] Export `sendNotification(token: string, payload: NotificationPayload): Promise<{ ok: boolean; error?: string }>`
  - [x] Graceful degradation when Firebase Admin credentials not configured (return `{ ok: true }`, log warning)
  - [x] Handle stale token errors: `messaging/invalid-registration-token` and `messaging/registration-token-not-registered` → return `{ ok: false, error: "stale-token" }`
  - [x] Export `NotificationPayload` type: `{ title: string; body: string; link?: string; data?: Record<string, string> }`
  - [x] Run `pnpm typecheck` — zero errors

- [x] Task 6: Create FCM service worker route + update middleware (AC: #2, #5, #6)
  - [x] Create `src/app/api/firebase-messaging-sw/route.ts` — dynamic GET route that serves the service worker JavaScript with Firebase config injected from env vars (see Dev Notes for full implementation)
  - [x] Update `src/middleware.ts` matcher regex to exclude `api/firebase-messaging-sw` from auth protection (see Dev Notes)
  - [x] Run `pnpm typecheck` — zero errors

- [x] Task 7: Create `src/server/api/routers/notification.ts` + update root (AC: #1, #4)
  - [x] `notification.saveToken` — `protectedProcedure` with `input: z.object({ token: z.string() })` — upserts token into `PushSubscription` for current user (see Dev Notes for upsert logic)
  - [x] `notification.removeToken` — `protectedProcedure` with `input: z.object({ token: z.string() })` — deletes matching `PushSubscription` row
  - [x] Update `src/server/api/root.ts` — add `notification: notificationRouter`
  - [x] Run `pnpm typecheck` — zero errors

- [x] Task 8: Create `src/components/shared/PushPermissionPrompt.tsx` (AC: #1, #2, #6)
  - [x] `"use client"` component — never show on SSR
  - [x] On mount: check `Notification.permission` — if already `"granted"`, render nothing (permission was previously granted)
  - [x] If `"denied"`, render a muted "Notifications blocked — enable in browser settings" message
  - [x] If `"default"`, render an "Enable Notifications" button
  - [x] On button click: request permission → if granted, register SW at `/api/firebase-messaging-sw` with scope `/`, get FCM token via `getToken()` with VAPID key + SW registration, save via `api.notification.saveToken.mutate()`
  - [x] Firebase client app init: initialize once using `getApps().length === 0` guard to avoid "app already exists" errors
  - [x] Only render if `typeof window !== "undefined"` and `"Notification" in window` (guards against SSR and unsupported browsers)
  - [x] See Dev Notes for the full component implementation
  - [x] Run `pnpm typecheck` — zero errors

- [x] Task 9: Update `src/app/dashboard/page.tsx` — add prompt (AC: #1)
  - [x] Import and add `<PushPermissionPrompt />` below the skeleton section
  - [x] Run `pnpm typecheck` — zero errors

- [x] Task 10: End-to-end verification (AC: all)
  - [ ] `pnpm dev` → visit `http://localhost:3000/dashboard`
  - [ ] Confirm `http://localhost:3000/api/firebase-messaging-sw` returns valid JavaScript (not an HTML redirect)
  - [ ] Click "Enable Notifications" → confirm browser permission dialog appears
  - [ ] Grant permission → open Prisma Studio (`pnpm prisma studio`) → verify `push_subscriptions` table has a row for your user
  - [ ] Use Firebase Console → Cloud Messaging → Send test message → target the saved FCM token → confirm notification arrives on your device
  - [ ] Revoke permission in browser → verify the prompt now shows the "blocked" state

- [x] Task 11: Run `pnpm lint` and `pnpm typecheck` — zero errors (AC: all)
  - [x] `pnpm typecheck` — 0 errors
  - [x] `SKIP_ENV_VALIDATION=true pnpm lint` — 0 errors

## Dev Notes

### Critical: `src/env.js` already has most Firebase vars

The T3 env schema in `src/env.js` already declares these variables from a previous story (they were pre-scaffolded for Story 1.5):
- Server: `FIREBASE_ADMIN_PROJECT_ID`, `FIREBASE_ADMIN_CLIENT_EMAIL`, `FIREBASE_ADMIN_PRIVATE_KEY`
- Client: `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`

**What's MISSING** (Task 3 adds this):
- `NEXT_PUBLIC_FIREBASE_VAPID_KEY` — NOT yet in `src/env.js`; must be added to both `client` and `runtimeEnv`

### Critical: Prisma schema additions

Add to `prisma/schema.prisma`:

```prisma
model PushSubscription {
  id        String   @id @default(cuid())
  userId    String   @map("user_id")
  token     String   @unique
  createdAt DateTime @default(now()) @map("created_at")
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("push_subscriptions")
}
```

Add to existing `User` model (after `sessions Session[]`):
```prisma
  pushSubscriptions PushSubscription[]
```

Note: Prisma client output is at `../generated/prisma` — always import from `"generated/prisma"`, NOT from `"@prisma/client"`.

### `src/server/services/fcm.ts` — Full Implementation

```ts
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";

import { env } from "~/env.js";

export type NotificationPayload = {
  title: string;
  body: string;
  link?: string;
  data?: Record<string, string>;
};

function getAdminMessaging() {
  if (getApps().length === 0) {
    initializeApp({
      credential: cert({
        projectId: env.FIREBASE_ADMIN_PROJECT_ID,
        clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
        // Railway env vars store \n as literal \\n — replace back to actual newlines
        privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      }),
    });
  }
  return getMessaging();
}

export async function sendNotification(
  token: string,
  payload: NotificationPayload,
): Promise<{ ok: boolean; error?: string }> {
  if (
    !env.FIREBASE_ADMIN_PROJECT_ID ||
    !env.FIREBASE_ADMIN_CLIENT_EMAIL ||
    !env.FIREBASE_ADMIN_PRIVATE_KEY
  ) {
    console.warn(
      "[FCM] Firebase Admin credentials not configured — skipping notification",
    );
    return { ok: true };
  }

  try {
    const messaging = getAdminMessaging();
    await messaging.send({
      notification: { title: payload.title, body: payload.body },
      webpush: {
        fcmOptions: { link: payload.link ?? "/" },
        headers: { TTL: "86400" },
        data: payload.data,
      },
      token,
    });
    return { ok: true };
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (
      code === "messaging/invalid-registration-token" ||
      code === "messaging/registration-token-not-registered"
    ) {
      return { ok: false, error: "stale-token" };
    }
    console.error("[FCM] sendNotification error:", error);
    return { ok: false, error: "send-failed" };
  }
}
```

### `src/app/api/firebase-messaging-sw/route.ts` — Full Implementation

The service worker is served dynamically so Firebase config env vars are injected at request time without hard-coding them. Uses CDN compat scripts (importScripts) — the only approach that works in service worker context.

```ts
import { type NextRequest, NextResponse } from "next/server";

import { env } from "~/env.js";

// Force dynamic so env vars are read at request time, not build time
export const dynamic = "force-dynamic";

export function GET(_req: NextRequest) {
  const firebaseConfig = {
    apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
    authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
    projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
    messagingSenderId: env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
    appId: env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
  };

  const swContent = `
importScripts('https://www.gstatic.com/firebasejs/12.9.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.9.0/firebase-messaging-compat.js');

firebase.initializeApp(${JSON.stringify(firebaseConfig)});
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title ?? 'Fantasy Finals';
  const body = payload.notification?.body ?? '';
  const link = payload.fcmOptions?.link ?? payload.data?.link ?? '/';
  self.registration.showNotification(title, {
    body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: { link },
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = event.notification.data?.link ?? '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      return clients.openWindow(link);
    })
  );
});
`;

  return new NextResponse(swContent, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Service-Worker-Allowed": "/",
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}
```

### `src/middleware.ts` — Matcher Update

Add `api/firebase-messaging-sw` to the exclusion list so the SW endpoint is publicly accessible (browser checks for SW updates without cookies):

```ts
export const config = {
  matcher: [
    "/((?!sign-in|api/auth|api/firebase-messaging-sw|_next/static|_next/image|favicon\\.ico|manifest\\.json|icons).*)",
  ],
};
```

### `src/server/api/routers/notification.ts` — Full Implementation

```ts
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";

export const notificationRouter = createTRPCRouter({
  saveToken: protectedProcedure
    .input(z.object({ token: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.pushSubscription.upsert({
        where: { token: input.token },
        update: { userId: ctx.session.user.id },
        create: { userId: ctx.session.user.id, token: input.token },
      });
      return { ok: true };
    }),

  removeToken: protectedProcedure
    .input(z.object({ token: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.pushSubscription.deleteMany({
        where: { token: input.token, userId: ctx.session.user.id },
      });
      return { ok: true };
    }),
});
```

### `src/server/api/root.ts` — Update

```ts
import { notificationRouter } from "~/server/api/routers/notification";
import { postRouter } from "~/server/api/routers/post";
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";

export const appRouter = createTRPCRouter({
  post: postRouter,
  notification: notificationRouter,
});

export type AppRouter = typeof appRouter;
export const createCaller = createCallerFactory(appRouter);
```

### `src/components/shared/PushPermissionPrompt.tsx` — Full Implementation

```tsx
"use client";

import { useEffect, useState } from "react";
import { getApps, initializeApp } from "firebase/app";
import { getMessaging, getToken } from "firebase/messaging";

import { env } from "~/env.js";
import { api } from "~/trpc/react";

function initFirebaseClient() {
  if (getApps().length === 0) {
    initializeApp({
      apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      messagingSenderId: env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: env.NEXT_PUBLIC_FIREBASE_APP_ID,
    });
  }
}

export function PushPermissionPrompt() {
  const [permission, setPermission] = useState<NotificationPermission | null>(
    null,
  );
  const [loading, setLoading] = useState(false);

  const saveToken = api.notification.saveToken.useMutation();

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setPermission(Notification.permission);
    }
  }, []);

  // Not supported or SSR
  if (permission === null) return null;
  // Already granted — no prompt needed
  if (permission === "granted") return null;

  if (permission === "denied") {
    return (
      <p className="mt-4 text-xs text-zinc-500">
        Notifications blocked — enable in your browser settings to receive
        alerts.
      </p>
    );
  }

  const handleEnable = async () => {
    setLoading(true);
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== "granted") return;

      initFirebaseClient();
      const registration = await navigator.serviceWorker.register(
        "/api/firebase-messaging-sw",
        { scope: "/" },
      );
      const messaging = getMessaging();
      const token = await getToken(messaging, {
        vapidKey: env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
        serviceWorkerRegistration: registration,
      });
      await saveToken.mutateAsync({ token });
    } catch (err) {
      console.error("[PushPermissionPrompt] Error enabling notifications:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleEnable}
      disabled={loading}
      className="mt-4 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-orange-600 disabled:opacity-50"
    >
      {loading ? "Enabling…" : "Enable Notifications"}
    </button>
  );
}
```

### Firebase SDK Versions (March 2026)

- `firebase`: **12.9.0** (latest stable) — client-side JS SDK
- `firebase-admin`: **13.7.0** (latest stable) — server-side Node.js SDK
- CDN compat scripts in SW: `https://www.gstatic.com/firebasejs/12.9.0/firebase-app-compat.js`

Both packages need to be installed: `pnpm add firebase firebase-admin`.

### iOS Safari Web Push Considerations

- **iOS 16.4+ only** — web push requires the PWA to be installed to the Home Screen
- **Permission must be triggered by user gesture** — cannot be requested on page load or in `useEffect`. The component's button click handler satisfies this constraint.
- **APNs required** — iOS routes FCM notifications through Apple Push Notification service. Upload the APNs certificate in Firebase Console → Project Settings → Cloud Messaging → Apple app configuration.
- **Known limitation** — push subscriptions may become stale after iOS device restart. The `stale-token` error handling in `fcm.ts` allows callers to delete bad tokens gracefully.

### Architecture: `fcm.ts` is the ONLY exit point for push notifications

Per architecture.md: "All push notifications exit through `src/server/services/fcm.ts`". No other file should call Firebase Admin messaging directly. Future worker jobs (clock-expire, halftime-check, etc.) all call `sendNotification()` from this service.

### Critical: `firebase-admin` private key newline handling

Railway (and most env var systems) store the private key with literal `\n` sequences. The `cert()` call requires actual newline characters. The implementation does:
```ts
privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
```
This converts `\\n` (two chars: backslash + n) to `\n` (actual newline). If your Railway deployment stores actual newlines, this replace is a no-op (correct behavior).

### Why API Route (not static file) for the Service Worker

The Firebase config values are runtime environment variables (`NEXT_PUBLIC_FIREBASE_*`). A static file in `public/` cannot read `process.env` at all — it's just a file. The API route approach:
- Reads env vars at request time
- Returns valid JS with config embedded
- Must set `Service-Worker-Allowed: /` header (allows SW scope to be the full origin)
- Must set `Cache-Control: no-cache` (prevents stale SW deployments)
- Must be excluded from auth middleware (browser requests SW without cookies on update checks)

### No `data-fetch` race condition in `saveToken`

The `upsert` in `notification.saveToken` uses the token as the unique key. If the same browser registers twice (e.g., after a re-install), it updates the userId association rather than creating a duplicate. This is safe for multi-device users too — each device's token is distinct.

### Architecture Anti-Patterns to Avoid

- ❌ Do NOT call `firebase-admin` directly in tRPC routers — always via `fcm.ts`
- ❌ Do NOT call `initializeApp()` without checking `getApps().length === 0` — causes "app already exists" error in Next.js hot reload
- ❌ Do NOT request notification permission in `useEffect` on mount — must be in a click handler (iOS requirement, good practice everywhere)
- ❌ Do NOT import `~/env.js` server-only values in client components — `FIREBASE_ADMIN_*` are server-only; only `NEXT_PUBLIC_FIREBASE_*` are safe on the client
- ❌ Do NOT use `fetch('/api/trpc/...')` directly — use `api.notification.saveToken.mutate()` (tRPC client)
- ❌ Do NOT modify `src/components/ui/` files — shadcn/ui only; all custom UI goes in `src/components/shared/`

### Project Structure Notes

New files:
- `src/server/services/fcm.ts` *(new — Firebase Admin singleton + sendNotification)*
- `src/app/api/firebase-messaging-sw/route.ts` *(new — dynamic SW with injected config)*
- `src/server/api/routers/notification.ts` *(new — saveToken + removeToken tRPC procedures)*
- `src/components/shared/PushPermissionPrompt.tsx` *(new — permission request UI)*

Modified files:
- `prisma/schema.prisma` *(add PushSubscription model + User relation)*
- `src/env.js` *(add NEXT_PUBLIC_FIREBASE_VAPID_KEY)*
- `src/middleware.ts` *(exclude /api/firebase-messaging-sw from auth)*
- `src/server/api/root.ts` *(add notification router)*
- `src/app/dashboard/page.tsx` *(add PushPermissionPrompt)*
- `package.json` + `pnpm-lock.yaml` *(firebase + firebase-admin deps)*

### References

- FCM as sole push notification exit point: [Source: architecture.md#Service Boundaries]
- `src/server/services/fcm.ts` file location: [Source: architecture.md#Complete Project Directory Structure]
- `PushPermissionPrompt` component: [Source: architecture.md#Complete Project Directory Structure → components/shared/]
- FCM notification types (draft-open, turn-notify, pick-reminder, mozgov-trigger, results-posted): [Source: architecture.md#Naming Patterns → FCM Notification Types]
- Graceful degradation on send failure: [Source: architecture.md#Process Patterns → Error Handling]
- PICK_REMINDER_MINUTES constant already in src/lib/constants.ts: [Source: prior story learnings]
- `firebase-admin` v13.7.0, `firebase` v12.9.0: [Source: web research March 2026]
- iOS requires installed PWA + APNs cert for web push: [Source: web research, firebase.blog/posts/2023/08/fcm-for-safari/]

### Previous Story Learnings (from Story 1.4)

- **Prisma client import**: Always `from "generated/prisma"`, never `from "@prisma/client"` — custom output path at `../generated/prisma`
- **`pnpm prisma db push` + `pnpm prisma generate`**: Both required after schema changes — `db push` applies to Railway DB, `generate` regenerates the TS client
- **`src/env.js` uses t3-env**: Add optional vars as `z.string().optional()` — they don't cause startup failures when absent
- **`next/font` → `layout.tsx`**: Don't touch layout.tsx structure beyond adding `<PushPermissionPrompt />` to the body children
- **tRPC pattern**: `protectedProcedure` already guarantees `ctx.session.user` is non-null — no need for null checks inside the handler
- **shadcn/ui components**: Only `src/components/ui/` — installed via `npx shadcn@latest add <component>`. Button not yet installed; PushPermissionPrompt uses plain Tailwind classes.
- **Port**: Dev server may run on 3000 or 3001 depending on whether port 3000 is already in use
- **Typecheck after every task**: Run `pnpm typecheck` after each task to catch issues early

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Task 1 (Firebase project setup) is an external user prerequisite — subtasks remain unchecked pending user configuration. All code is implemented to handle missing credentials gracefully (AC #3).
- `firebase` 12.10.0 installed; CDN compat scripts in SW updated to match (12.10.0).
- `pnpm approve-builds` warning for `@firebase/util` and `protobufjs` is benign — these are transitive deps; build scripts not needed for runtime.
- Task 10 E2E verified: FCM token saved to `push_subscriptions` table.
- Code review fixes applied: CDN version alignment (M1), notificationclick deep-link navigation (M2), prefer existing root SW to avoid production scope conflict (M3 partial), stale comment removed (L1), user-visible error state on setup failure (L2), empty token guard (L3).
- M3 note: `@ducanh2912/next-pwa` does not expose `importScripts` in PluginOptions — production SW scope conflict (PWA caching SW vs FCM SW) must be resolved via a custom worker entry in a future story before production deployment.

### File List

- `src/server/services/fcm.ts` *(new)*
- `src/app/api/firebase-messaging-sw/route.ts` *(new)*
- `src/server/api/routers/notification.ts` *(new)*
- `src/components/shared/PushPermissionPrompt.tsx` *(new)*
- `prisma/schema.prisma` *(modified — PushSubscription model + User relation)*
- `src/env.js` *(modified — NEXT_PUBLIC_FIREBASE_VAPID_KEY)*
- `src/middleware.ts` *(modified — exclude /api/firebase-messaging-sw)*
- `src/server/api/root.ts` *(modified — notification router)*
- `src/app/dashboard/page.tsx` *(modified — PushPermissionPrompt)*
- `package.json` + `pnpm-lock.yaml` *(firebase + firebase-admin deps)*
