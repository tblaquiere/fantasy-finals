import { PrismaAdapter } from "@auth/prisma-adapter";
import { type DefaultSession, type NextAuthConfig } from "next-auth";
import type {} from "next-auth/jwt"; // required for JWT module augmentation below
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import Resend from "next-auth/providers/resend";

import { type UserRole } from "generated/prisma";
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
      role: UserRole;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: UserRole;
  }
}

/**
 * Options for NextAuth.js used to configure adapters, providers, callbacks, etc.
 *
 * Providers:
 * - Resend: magic link (primary) — requires AUTH_RESEND_KEY + AUTH_EMAIL_FROM env vars
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
    // Dev-only: sign in as any email without sending a magic link
    // NEVER active in production
    ...(process.env.NODE_ENV === "development"
      ? [
          Credentials({
            id: "dev-login",
            name: "Dev Login",
            credentials: { email: { label: "Email", type: "email" } },
            async authorize(credentials) {
              if (!credentials?.email) return null;
              const email = credentials.email as string;
              const user = await db.user.upsert({
                where: { email },
                create: { email, role: "participant" },
                update: {},
              });
              return { id: user.id, email: user.email, role: user.role };
            },
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
    // On initial sign-in, user object is present — fetch role from DB and store in token.
    // Subsequent requests only have the token (no DB hit required).
    jwt: async ({ token, user }) => {
      if (user?.id) {
        const dbUser = await db.user.findUnique({
          where: { id: user.id },
          select: { role: true },
        });
        token.role = dbUser?.role ?? "participant";
      }
      return token;
    },
    // Propagate id and role from JWT token into the session object.
    session: ({ session, token }) => ({
      ...session,
      user: {
        ...session.user,
        id: token.sub ?? "",
        role: token.role ?? "participant",
      },
    }),
  },
} satisfies NextAuthConfig;
