import type { Job } from "pg-boss";

export type ClockExpirePayload = {
  pickId: string;
  leagueId: string;
  gameId: string;
};

// Stub handler — full implementation in Story 3.9 (Auto-Assign on Clock Expiry)
export async function handleClockExpire(
  jobs: Job<ClockExpirePayload>[],
): Promise<void> {
  const job = jobs[0];
  if (!job) return;
  console.log(
    `[worker] clock.expire: pickId=${job.data.pickId} leagueId=${job.data.leagueId} gameId=${job.data.gameId}`,
  );
}
