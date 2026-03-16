/**
 * YOU PROBABLY DON'T NEED TO EDIT THIS FILE, UNLESS:
 * 1. You want to modify request context (see Part 1).
 * 2. You want to create a new middleware or type of procedure (see Part 3).
 *
 * TL;DR - This is where all the tRPC server stuff is created and plugged in. The pieces you will
 * need to use are documented accordingly near the end.
 */

import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";

import { type UserRole } from "generated/prisma";
import { auth } from "~/server/auth";
import { db } from "~/server/db";

/**
 * 1. CONTEXT
 *
 * This section defines the "contexts" that are available in the backend API.
 *
 * These allow you to access things when processing a request, like the database, the session, etc.
 *
 * This helper generates the "internals" for a tRPC context. The API handler and RSC clients each
 * wrap this and provides the required context.
 *
 * @see https://trpc.io/docs/server/context
 */
export const createTRPCContext = async (opts: { headers: Headers }) => {
  const session = await auth();

  return {
    db,
    session,
    ...opts,
  };
};

/**
 * 2. INITIALIZATION
 *
 * This is where the tRPC API is initialized, connecting the context and transformer. We also parse
 * ZodErrors so that you get typesafety on the frontend if your procedure fails due to validation
 * errors on the backend.
 */
const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

/**
 * Create a server-side caller.
 *
 * @see https://trpc.io/docs/server/server-side-calls
 */
export const createCallerFactory = t.createCallerFactory;

/**
 * 3. ROUTER & PROCEDURE (THE IMPORTANT BIT)
 *
 * These are the pieces you use to build your tRPC API. You should import these a lot in the
 * "/src/server/api/routers" directory.
 */

/**
 * This is how you create new routers and sub-routers in your tRPC API.
 *
 * @see https://trpc.io/docs/router
 */
export const createTRPCRouter = t.router;

/**
 * Middleware for timing procedure execution and adding an artificial delay in development.
 *
 * You can remove this if you don't like it, but it can help catch unwanted waterfalls by simulating
 * network latency that would occur in production but not in local development.
 */
const timingMiddleware = t.middleware(async ({ next, path }) => {
  const start = Date.now();

  if (t._config.isDev) {
    // artificial delay in dev
    const waitMs = Math.floor(Math.random() * 400) + 100;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  const result = await next();

  const end = Date.now();
  console.log(`[TRPC] ${path} took ${end - start}ms to execute`);

  return result;
});

/**
 * Public (unauthenticated) procedure
 *
 * This is the base piece you use to build new queries and mutations on your tRPC API. It does not
 * guarantee that a user querying is authorized, but you can still access user session data if they
 * are logged in.
 */
export const publicProcedure = t.procedure.use(timingMiddleware);

/**
 * Protected (authenticated) procedure
 *
 * If you want a query or mutation to ONLY be accessible to logged in users, use this. It verifies
 * the session is valid and guarantees `ctx.session.user` is not null.
 *
 * @see https://trpc.io/docs/procedures
 */
export const protectedProcedure = t.procedure
  .use(timingMiddleware)
  .use(({ ctx, next }) => {
    if (!ctx.session?.user) {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }
    return next({
      ctx: {
        // infers the `session` as non-nullable
        session: { ...ctx.session, user: ctx.session.user },
      },
    });
  });

/**
 * Role-enforcement middleware factory.
 * Throws FORBIDDEN if the authenticated user's role is not in allowedRoles.
 * Must be chained from protectedProcedure (session.user is guaranteed non-null).
 * Internal — used to compose commissionerProcedure and adminProcedure below.
 */
const enforceRole = (allowedRoles: UserRole[]) =>
  t.middleware(({ ctx, next }) => {
    // protectedProcedure guarantees session.user is non-null before this runs.
    // Defensive check retained to prevent misuse if called outside that chain.
    if (!ctx.session?.user) {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }
    if (!allowedRoles.includes(ctx.session.user.role)) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }
    return next({
      ctx: {
        // Mirror the same explicit narrowing pattern as protectedProcedure
        // so downstream handlers always receive a fully typed session.user.
        session: { ...ctx.session, user: ctx.session.user },
      },
    });
  });

/**
 * Ownership enforcement helper.
 * Call inside a procedure handler to ensure the caller owns the requested resource.
 * Throws FORBIDDEN if session.user.id !== resourceUserId.
 *
 * Deliberately a function (not middleware) because resourceUserId comes from `input`,
 * which is only available inside the handler — not in the middleware chain.
 *
 * @example
 * enforceOwner(ctx.session, input.userId); // throws FORBIDDEN if caller != owner
 */
export const enforceOwner = (
  session: { user: { id: string } },
  resourceUserId: string,
) => {
  if (session.user.id !== resourceUserId) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
};

/**
 * Commissioner procedure — requires commissioner or admin role.
 * Extends protectedProcedure (auth already verified) then enforces role.
 * Use for league management operations (create, edit, override picks, etc.).
 */
export const commissionerProcedure = protectedProcedure
  .use(enforceRole(["commissioner", "admin"]));

/**
 * Admin procedure — requires admin role only.
 * Extends protectedProcedure (auth already verified) then enforces role.
 * Use for platform-wide operations (cross-league panel, platform settings, etc.).
 */
export const adminProcedure = protectedProcedure
  .use(enforceRole(["admin"]));
