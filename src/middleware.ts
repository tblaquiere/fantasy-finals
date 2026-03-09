export { auth as middleware } from "~/server/auth";

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT:
     * - /sign-in (public auth page)
     * - /api/auth/* (NextAuth endpoints)
     * - /_next/static, /_next/image (Next.js internals)
     * - /favicon.ico, /manifest.json, /icons/* (static + PWA assets)
     */
    "/((?!sign-in|api/auth|_next/static|_next/image|favicon\\.ico|manifest\\.json|icons).*)",
  ],
};
