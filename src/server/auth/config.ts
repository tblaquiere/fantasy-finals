import { PrismaAdapter } from "@auth/prisma-adapter";
import { type DefaultSession, type NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import Resend from "next-auth/providers/resend";

import { env } from "~/env";
import { db } from "~/server/db";

/**
 * Module augmentation for `next-auth` types. Allows us to add custom properties to the `session`
 * object and keep type safety.
 *
 * @see https://next-auth.js.org/getting-started/typescript#module-augmentation
 */
declare module "next-auth" {
  interface Session extends DefaultSession {
    user: {
      id: string;
      // ...other properties
      // role: UserRole;
    } & DefaultSession["user"];
  }

  // interface User {
  //   // ...other properties
  //   // role: UserRole;
  // }
}

/**
 * Options for NextAuth.js used to configure adapters, providers, callbacks, etc.
 *
 * Providers:
 * - Nodemailer: magic link (primary) — requires AUTH_EMAIL_SERVER_* env vars
 * - Google OAuth: optional — only registered when AUTH_GOOGLE_ID/SECRET are set
 *
 * @see https://next-auth.js.org/configuration/options
 */
export const authConfig = {
  providers: [
    // Magic link via Resend (HTTP API — no SMTP port issues)
    ...(env.AUTH_RESEND_KEY && env.AUTH_EMAIL_FROM
      ? [
          Resend({
            apiKey: env.AUTH_RESEND_KEY,
            from: env.AUTH_EMAIL_FROM,
          }),
        ]
      : []),
    // Google OAuth (optional) — registered when OAuth credentials are set
    ...(env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET
      ? [
          Google({
            clientId: env.AUTH_GOOGLE_ID,
            clientSecret: env.AUTH_GOOGLE_SECRET,
          }),
        ]
      : []),
  ],
  adapter: PrismaAdapter(db),
  session: {
    // JWT strategy allows edge-compatible middleware to verify sessions
    // without DB access. PrismaAdapter still persists User + Account records.
    strategy: "jwt",
  },
  pages: {
    signIn: "/sign-in",
  },
  callbacks: {
    // With JWT strategy, token.sub is the user ID (set automatically by next-auth)
    session: ({ session, token }) => ({
      ...session,
      user: {
        ...session.user,
        id: token.sub ?? "",
      },
    }),
  },
} satisfies NextAuthConfig;
