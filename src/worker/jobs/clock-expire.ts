import type { Job } from "pg-boss";

export type ClockExpirePayload = {
  slotId: string;
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
    `[worker] clock.expire: slotId=${job.data.slotId} leagueId=${job.data.leagueId} gameId=${job.data.gameId}`,
  );
}
