import NextAuth from "next-auth";

/**
 * Edge-compatible auth config — no Node.js providers or PrismaAdapter.
 * Verifies JWT session tokens using AUTH_SECRET without any DB access.
 * The full config (with nodemailer + Google + PrismaAdapter) lives in
 * src/server/auth/config.ts and runs only in the Node.js runtime.
 */
const { auth } = NextAuth({
  providers: [],
  pages: { signIn: "/sign-in" },
  callbacks: {
    authorized({ auth: session }) {
      return !!session?.user;
    },
  },
});

export default auth;

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
