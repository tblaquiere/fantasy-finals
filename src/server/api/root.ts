import { adminRouter } from "~/server/api/routers/admin";
import { draftRouter } from "~/server/api/routers/draft";
import { gameRouter } from "~/server/api/routers/game";
import { leagueRouter } from "~/server/api/routers/league";
import { notificationRouter } from "~/server/api/routers/notification";
import { postRouter } from "~/server/api/routers/post";
import { standingRouter } from "~/server/api/routers/standing";
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  post: postRouter,
  notification: notificationRouter,
  league: leagueRouter,
  admin: adminRouter,
  game: gameRouter,
  draft: draftRouter,
  standing: standingRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 * @example
 * const trpc = createCaller(createContext);
 * const res = await trpc.post.all();
 *       ^? Post[]
 */
export const createCaller = createCallerFactory(appRouter);
