import type { Job } from "pg-boss";

export type DraftOpenPayload = {
  leagueId: string;
  gameId: string;
};

// Stub handler — full implementation in Story 3.3 (Draft Order Generation)
export async function handleDraftOpen(
  jobs: Job<DraftOpenPayload>[],
): Promise<void> {
  const job = jobs[0];
  if (!job) return;
  console.log(
    `[worker] draft.open: leagueId=${job.data.leagueId} gameId=${job.data.gameId}`,
  );
}
