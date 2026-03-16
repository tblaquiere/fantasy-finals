import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createTRPCRouter, adminProcedure } from "~/server/api/trpc";

export const adminRouter = createTRPCRouter({
  recalculateDraftOrder: adminProcedure
    .input(z.object({ leagueId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const league = await ctx.db.league.findUnique({
        where: { id: input.leagueId },
        select: { id: true },
      });
      if (!league) {
        throw new TRPCError({ code: "NOT_FOUND", message: "League not found" });
      }
      // Epic 3 (Story 3.3) will replace this stub with real draft order logic
      return {
        status: "not_available" as const,
        message: "Draft order calculation requires Epic 3",
      };
    }),
});
