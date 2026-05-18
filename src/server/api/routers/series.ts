import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { listAvailablePlayoffSeries } from "~/server/services/playoff-series";

export const seriesRouter = createTRPCRouter({
  listAvailable: publicProcedure.query(async () => {
    return listAvailablePlayoffSeries();
  }),
});
