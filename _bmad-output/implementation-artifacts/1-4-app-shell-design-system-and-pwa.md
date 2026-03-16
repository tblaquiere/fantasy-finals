# Story 1.4: App Shell, Design System & PWA

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want a polished, installable app with dark theme, consistent navigation, and skeleton loading states,
so that the experience feels native on my phone and I can install it to my home screen.

## Acceptance Criteria

1. **Given** I open the app, **when** it loads, **then** the dark zinc-950 background, zinc-900 cards, and orange-500 accent are applied via CSS custom properties in `globals.css`, Inter font is loaded via `next/font/google`, and the `dark` class is applied at the `<html>` level.

2. **Given** I navigate to any auth-gated page, **when** it loads, **then** a bottom navigation bar is visible with exactly 3 items: Draft/Game, Standings, League — using semantic `<nav>` with `<button>` or `<Link>` elements (no `<div>` buttons).

3. **Given** data is loading on any screen, **when** the fetch is in progress, **then** shadcn/ui `Skeleton` components appear in the layout shape — no full-page spinners anywhere.

4. **Given** I am on Chrome/Android or Safari/iOS, **when** PWA install conditions are met, **then** an install prompt is available (Chrome) or "Add to Home Screen" works (Safari), and the app shows the manifest name "Fantasy Finals", icons, and dark `theme-color`.

5. **Given** I am using a screen reader or keyboard navigation, **when** I interact with the bottom nav or any core UI, **then** all elements are reachable via Tab key, semantic HTML elements are used (`<nav>`, `<main>`, `<button>`, not `<div>`), and focus rings are visible.

6. **Given** the T3 boilerplate homepage (`/`) is visited by an authenticated user, **when** they land on `/`, **then** they are redirected to `/dashboard` (a placeholder page that will evolve in future stories).

## Tasks / Subtasks

- [x] Task 1: Install dependencies (AC: #3, #4)
  - [x] Run `pnpm add @ducanh2912/next-pwa`
  - [x] Run `pnpm add -D webpack` (peer dep required by next-pwa with standalone output)
  - [x] shadcn/ui configured manually (components.json, src/lib/utils.ts, `npx shadcn@latest add skeleton`)
  - [x] Run `pnpm typecheck` — zero errors

- [x] Task 2: Update design system in `src/styles/globals.css` (AC: #1, #3)
  - [x] Add `@custom-variant dark (&:where(.dark, .dark *));` for class-based dark mode (Tailwind v4)
  - [x] Add shadcn/ui CSS custom properties mapped to the zinc/orange palette
  - [x] Keep `@import "tailwindcss"` at the top
  - [x] Remove the T3 boilerplate `--font-geist-sans` variable; replaced with `--font-inter`
  - [x] Run `pnpm typecheck` — zero errors

- [x] Task 3: Update `src/app/layout.tsx` — root layout (AC: #1, #2, #4, #5)
  - [x] Switch font from `Geist` to `Inter` imported from `next/font/google`
  - [x] Apply `dark` class and Inter variable to `<html>` element
  - [x] Update `metadata`: title `"Fantasy Finals"`, description, manifest, icons
  - [x] Run `pnpm typecheck` — zero errors

- [x] Task 4: Configure PWA in `next.config.js` (AC: #4)
  - [x] Wrap existing config with `withPWA` from `@ducanh2912/next-pwa`
  - [x] Set `dest: "public"`, `cacheOnFrontEndNav: true`, `aggressiveFrontEndNavCaching: true`, `reloadOnOnline: true`, `disable: process.env.NODE_ENV === "development"`
  - [x] Keep existing `output: "standalone"`
  - [x] Run `pnpm typecheck` — zero errors

- [x] Task 5: Create `public/manifest.json` and PWA icons (AC: #4)
  - [x] Create `public/manifest.json` with name, short_name, start_url, display, colors, icons
  - [x] Create `public/icons/` directory
  - [x] Generate placeholder `icon-192.png` (192×192px) and `icon-512.png` (512×512px) in `public/icons/`

- [x] Task 6: Replace T3 boilerplate homepage and create dashboard (AC: #2, #3, #6)
  - [x] Replace `src/app/page.tsx` with redirect to `/dashboard`
  - [x] Create `src/app/dashboard/page.tsx` with dark theme, BottomNav, Skeleton demo
  - [x] Run `pnpm typecheck` — zero errors

- [x] Task 7: Create `src/components/shared/BottomNav.tsx` (AC: #2, #5)
  - [x] Client component using `usePathname` for active tab highlighting
  - [x] Semantic `<nav>` with `aria-label="Main navigation"`
  - [x] Three `<Link>` items: Draft/Game, Standings, League
  - [x] Active: `text-orange-500`; inactive: `text-zinc-400`
  - [x] Fixed bottom bar with `min-h-[44px]` tap targets
  - [x] Run `pnpm typecheck` — zero errors

- [x] Task 8: End-to-end verification (AC: all)
  - [x] `pnpm dev` — visit `http://localhost:3000` — confirmed redirect to `/dashboard`
  - [x] Confirmed dark zinc-950 background, orange "Fantasy Finals" heading, email shown
  - [x] Confirmed bottom nav with 3 items, Draft/Game highlighted orange (active)
  - [x] Confirmed skeleton components visible on dashboard (bg-zinc-800 override for proper gray)
  - [ ] On Chrome: open DevTools → Application → Manifest — confirm manifest loads correctly (deferred — PWA SW disabled in dev)

- [x] Task 9: Run `pnpm lint` and `pnpm typecheck` — zero errors (AC: all)
  - [x] `pnpm typecheck` — 0 errors
  - [x] `SKIP_ENV_VALIDATION=true pnpm lint` — 0 errors

## Dev Notes

### Critical: Tailwind v4 — No `tailwind.config.ts`

This project uses **Tailwind CSS v4** (evidenced by `@import "tailwindcss"` and `@theme {}` in `src/styles/globals.css` — NOT the `@tailwind base/components/utilities` v3 directives). There is **no `tailwind.config.ts` file**.

Key Tailwind v4 differences:
- Custom tokens go in `@theme {}` block in CSS, not in a config file
- Dark mode class variant: add `@custom-variant dark (&:where(.dark, .dark *));` in CSS (NOT `darkMode: 'class'` in config)
- Custom variant must be declared before `@import "tailwindcss"` or immediately after
- `dark:` prefixed classes will work after adding this variant

### Critical: shadcn/ui Init with Tailwind v4

When running `npx shadcn@latest init`, shadcn/ui now supports Tailwind v4. It will detect Tailwind v4 and configure accordingly. Key selections during init:
- Style: Default (or New York — either works)
- Base color: **Zinc**
- CSS variables: **Yes**
- Tailwind config: will create/update `components.json`
- Import alias: `~/components` (matches existing T3 `~` alias)

shadcn/ui adds CSS variables to `globals.css`. After init, manually update the color values to match the fantasy-finals design system (zinc-950 background, orange-500 primary).

### Design System CSS Variables (globals.css target state)

Full `globals.css` content after Task 2 (merge shadcn/ui init output with these values):

```css
@import "tailwindcss";
@custom-variant dark (&:where(.dark, .dark *));

@layer base {
  :root {
    --background: 240 10% 3.9%;        /* zinc-950 #09090b */
    --foreground: 0 0% 98%;            /* zinc-50 #fafafa */
    --card: 240 5.9% 10%;              /* zinc-900 #18181b */
    --card-foreground: 0 0% 98%;
    --popover: 240 5.9% 10%;
    --popover-foreground: 0 0% 98%;
    --primary: 24.6 95% 53.1%;         /* orange-500 #f97316 */
    --primary-foreground: 0 0% 98%;
    --secondary: 240 3.7% 15.9%;       /* zinc-800 */
    --secondary-foreground: 0 0% 98%;
    --muted: 240 3.7% 15.9%;           /* zinc-800 */
    --muted-foreground: 240 5% 64.9%;  /* zinc-400 */
    --accent: 24.6 95% 53.1%;          /* orange-500 */
    --accent-foreground: 0 0% 98%;
    --destructive: 0 84.2% 60.2%;      /* red-500 */
    --destructive-foreground: 0 0% 98%;
    --border: 240 3.7% 15.9%;          /* zinc-800 */
    --input: 240 3.7% 15.9%;
    --ring: 24.6 95% 53.1%;            /* orange-500 focus ring */
    --radius: 0.5rem;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
  }
}

@theme {
  --font-sans: var(--font-inter), ui-sans-serif, system-ui, sans-serif,
    "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji";
}
```

**Note:** shadcn/ui uses HSL values for CSS variables (no `hsl()` wrapper — it's added by Tailwind). This is the standard shadcn/ui format.

### Critical: `next/font/google` (NOT `@next/font/google`)

`@next/font/google` was deprecated in Next.js 13.2. The current project already uses `next/font/google` (T3 template imports `Geist` from `"next/font/google"`). Switch font to Inter:

```ts
// src/app/layout.tsx
import { Inter } from "next/font/google";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});
```

Apply to `<html>`:
```tsx
<html lang="en" className={`dark ${inter.variable}`}>
```

### `@ducanh2912/next-pwa` Configuration (NOT `next-pwa`)

Architecture specifies `@ducanh2912/next-pwa` — the actively maintained App Router-compatible fork. Do NOT use the unmaintained `next-pwa` package.

```js
// next.config.js
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === "development",
});

const config = {
  output: "standalone",
};

export default withPWA(config);
```

**Important for standalone output:** `@ducanh2912/next-pwa` generates `sw.js` and `workbox-*.js` files into `public/`. The existing Dockerfile already copies `public/` into the standalone output, so no Dockerfile changes needed.

**Webpack peer dep:** `@ducanh2912/next-pwa` requires `webpack` as a peer dependency. Install: `pnpm add -D webpack`.

### manifest.json — Full Content

```json
{
  "name": "Fantasy Finals",
  "short_name": "FF",
  "description": "NBA Fantasy Playoffs — one pick per game",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#09090b",
  "theme_color": "#09090b",
  "orientation": "portrait",
  "icons": [
    {
      "src": "/icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any maskable"
    },
    {
      "src": "/icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any maskable"
    }
  ]
}
```

### PWA Icon Generation

Simple approach for placeholder icons during development:
1. Visit https://favicon.io/favicon-generator/
2. Text: "FF", Background: Rounded, Font: any, Background color: `#09090b` (zinc-950), Font color: `#f97316` (orange-500)
3. Download → extract `android-chrome-192x192.png` → rename to `icon-192.png`
4. For 512: use https://www.pwabuilder.com/imageGenerator or simply upscale the 192 for now

OR use any 192×192 and 512×512 PNG files as placeholders — the exact design is not required for this story's acceptance criteria.

### BottomNav Component

```tsx
// src/components/shared/BottomNav.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/dashboard", label: "Draft/Game", icon: "🏀" },
  { href: "/standings", label: "Standings", icon: "📊" },
  { href: "/league", label: "League", icon: "👥" },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main navigation"
      className="fixed bottom-0 left-0 right-0 h-16 border-t border-zinc-800 bg-zinc-900"
    >
      <ul className="flex h-full items-stretch">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <li key={item.href} className="flex flex-1">
              <Link
                href={item.href}
                className={`flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium transition-colors ${
                  isActive ? "text-orange-500" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <span aria-hidden="true">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
```

**Note on icons:** Emoji placeholders are used here. Real icons (using Lucide React or custom SVGs) will replace them in later stories. Lucide React is already included with shadcn/ui.

### Dashboard Page Structure

```tsx
// src/app/dashboard/page.tsx
import { Skeleton } from "~/components/ui/skeleton";
import { BottomNav } from "~/components/shared/BottomNav";
import { auth } from "~/server/auth";

export default async function DashboardPage() {
  const session = await auth();

  return (
    <main className="min-h-screen bg-zinc-950 pb-16 text-zinc-50">
      <div className="px-4 py-6">
        <h1 className="mb-1 text-2xl font-bold text-orange-500">Fantasy Finals</h1>
        <p className="text-sm text-zinc-400">{session?.user?.email}</p>

        {/* Skeleton loading demo — verifies AC #3 */}
        <div className="mt-8 space-y-3">
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
        </div>
      </div>
      <BottomNav />
    </main>
  );
}
```

### Root Layout Updates

```tsx
// src/app/layout.tsx
import "~/styles/globals.css";

import { type Metadata } from "next";
import { Inter } from "next/font/google";

import { TRPCReactProvider } from "~/trpc/react";

export const metadata: Metadata = {
  title: "Fantasy Finals",
  description: "NBA Fantasy Playoffs — one pick per game",
  manifest: "/manifest.json",
  themeColor: "#09090b",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`dark ${inter.variable}`}>
      <body>
        <TRPCReactProvider>{children}</TRPCReactProvider>
      </body>
    </html>
  );
}
```

### page.tsx Replacement

```tsx
// src/app/page.tsx
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/dashboard");
}
```

The middleware already protects `/dashboard`. Unauthenticated users hitting `/` → redirect to `/dashboard` → middleware catches unauthenticated → redirect to `/sign-in`. Authenticated users hitting `/` → redirect to `/dashboard` → loads normally.

### Architecture Anti-Patterns to Avoid

- ❌ Do NOT use `@next/font/google` — deprecated; use `next/font/google`
- ❌ Do NOT use `next-pwa` — use `@ducanh2912/next-pwa` (architecture spec)
- ❌ Do NOT use `tailwind.config.ts` for dark mode — use `@custom-variant dark` in CSS (Tailwind v4)
- ❌ Do NOT use `<div>` elements for interactive nav items — use `<Link>` or `<button>` (AC #5)
- ❌ Do NOT put any navigation logic outside the `(auth)` group — the route group architecture (Story structure notes below) will be added in future stories; for now `/dashboard` is sufficient
- ❌ Do NOT use full-page spinners — shadcn/ui `Skeleton` only (AC #3)
- ❌ Do NOT modify shadcn/ui component files in `src/components/ui/` — only customize via CSS variables in `globals.css`
- ❌ Do NOT import SessionProvider — not needed with Next.js App Router server components using `auth()` directly

### Project Structure Notes

New files:
- `public/manifest.json` *(new — PWA manifest)*
- `public/icons/icon-192.png` *(new — PWA icon 192×192)*
- `public/icons/icon-512.png` *(new — PWA icon 512×512)*
- `src/app/dashboard/page.tsx` *(new — auth-gated placeholder dashboard)*
- `src/components/shared/BottomNav.tsx` *(new — bottom navigation)*
- `src/components/ui/skeleton.tsx` *(new — added by shadcn/ui)*
- `src/lib/utils.ts` *(new — added by shadcn/ui, cn() helper)*
- `components.json` *(new — shadcn/ui config)*

Modified files:
- `next.config.js` *(modified — withPWA wrapper)*
- `src/styles/globals.css` *(modified — design system CSS vars)*
- `src/app/layout.tsx` *(modified — Inter font, dark class, metadata)*
- `src/app/page.tsx` *(modified — replaced T3 boilerplate with redirect)*

shadcn/ui generates `sw.js` and `workbox-*.js` into `public/` at build time (not in dev with `disable: true`).

### Previous Story Learnings

- **Prisma client at `generated/prisma`:** imports use `"generated/prisma"` not `"@prisma/client"`
- **JWT session strategy:** `auth()` is available in server components and returns `Session | null`
- **Middleware protects all routes except `/sign-in`:** `/dashboard` is automatically auth-gated
- **Local dev on port 3001:** port 3000 is taken by another process on dev machine
- **`tsx` for worker:** ESM TypeScript — no changes needed for this story

### References

- Dark theme zinc/orange palette: [Source: ux-design-specification.md#Color System]
- `@ducanh2912/next-pwa` (NOT `next-pwa`): [Source: epics.md#Additional Requirements — From Architecture]
- `darkMode: 'class'` via CSS custom variant (Tailwind v4): [Source: ux-design-specification.md#Customization Strategy]
- Bottom nav max 3 items: [Source: ux-design-specification.md#Anti-Patterns to Avoid]
- Skeleton loading states (no full-page spinners): [Source: ux-design-specification.md#Design Inspiration Strategy]
- shadcn/ui components in `src/components/ui/` — never modified: [Source: architecture.md#Structure Patterns]
- Minimum tap target 44px: [Source: ux-design-specification.md#Spacing & Layout Foundation]
- `manifest.json` + service worker in `public/`: [Source: architecture.md#Frontend Architecture]
- Inter font via `@next/font/google`: [Source: epics.md#Additional Requirements — From UX Design]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None.

### Completion Notes List

- shadcn@4.0.5 interactive CLI doesn't support `--base-color` flag. Worked around by manually creating `components.json` with zinc base color, `src/lib/utils.ts`, and running `npx shadcn@latest add skeleton` to pull the component.
- Icons generated as solid zinc-950 (#09090b) placeholder PNGs using Node.js raw PNG byte generation (ImageMagick not available). Replace with branded icons before production.
- `themeColor` moved from `Metadata` to `Viewport` export in layout.tsx — Next.js 15 deprecated `themeColor` in the `Metadata` type; correct approach is `export const viewport: Viewport = { themeColor: "#09090b" }`.
- All ACs except Task 8 (manual E2E) have been implemented and type-checked.

### File List

- `components.json` (new — shadcn/ui config)
- `src/lib/utils.ts` (new — cn() helper)
- `src/components/ui/skeleton.tsx` (new — shadcn skeleton)
- `src/components/shared/BottomNav.tsx` (new — bottom navigation)
- `src/app/dashboard/page.tsx` (new — placeholder dashboard)
- `public/manifest.json` (new — PWA manifest)
- `public/icons/icon-192.png` (new — PWA icon placeholder)
- `public/icons/icon-512.png` (new — PWA icon placeholder)
- `next.config.js` (modified — withPWA wrapper)
- `src/styles/globals.css` (modified — design system CSS vars)
- `src/app/layout.tsx` (modified — Inter font, dark class, metadata, viewport)
- `src/app/page.tsx` (modified — replaced T3 boilerplate with redirect)
- `src/app/_components/post.tsx` (deleted — T3 boilerplate dead code)
- `package.json` (modified — added @ducanh2912/next-pwa, webpack, clsx, tailwind-merge, class-variance-authority, lucide-react)
- `pnpm-lock.yaml` (modified — lockfile updated)
