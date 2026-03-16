import type { Job } from "pg-boss";

export type HalftimeCheckPayload = {
  gameId: string;
  leagueId: string;
};

// Stub handler — full implementation in Story 5.1 (Halftime Detection and Mozgov Trigger)
export async function handleHalftimeCheck(
  jobs: Job<HalftimeCheckPayload>[],
): Promise<void> {
  const job = jobs[0];
  if (!job) return;
  console.log(
    `[worker] halftime.check: gameId=${job.data.gameId} leagueId=${job.data.leagueId}`,
  );
}
