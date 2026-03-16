import type { Job } from "pg-boss";

export type StatsCorrectPayload = {
  gameId: string;
};

// Stub handler — full implementation in Story 6.4 (Automatic Post-Game Stat Corrections)
export async function handleStatsCorrect(
  jobs: Job<StatsCorrectPayload>[],
): Promise<void> {
  const job = jobs[0];
  if (!job) return;
  console.log(`[worker] stats.correct: gameId=${job.data.gameId}`);
}
