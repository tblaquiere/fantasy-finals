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
