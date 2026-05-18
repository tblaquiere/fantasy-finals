import { db } from "~/server/db";
import { type Session } from "next-auth";

// Creates a fake session for test contexts
export function makeSession(overrides?: Partial<Session["user"]>): Session {
  return {
    user: {
      id: overrides?.id ?? "test-user-id",
      email: overrides?.email ?? "test@example.com",
      name: overrides?.name ?? "Test User",
      role: overrides?.role ?? "participant",
    },
    expires: new Date(Date.now() + 86_400_000).toISOString(),
  };
}

// Fictional test-only series fixtures. createLeague validates seriesIds
// against the schedule-derived catalog (falling back to NbaSeries DB rows),
// so tests that exercise createLeague must seed matching NbaSeries rows.
const TEST_SERIES_FIXTURES: Record<string, {
  homeTeamId: number; awayTeamId: number;
  homeTeamName: string; awayTeamName: string;
  homeTricode: string; awayTricode: string;
}> = {
  "2025-wc1-okc-memphis": {
    homeTeamId: 1610612760, awayTeamId: 1610612763,
    homeTeamName: "Thunder", awayTeamName: "Grizzlies",
    homeTricode: "OKC", awayTricode: "MEM",
  },
  "2025-ec1-celtics-heat": {
    homeTeamId: 1610612738, awayTeamId: 1610612748,
    homeTeamName: "Celtics", awayTeamName: "Heat",
    homeTricode: "BOS", awayTricode: "MIA",
  },
  "2025-ec2-knicks-sixers": {
    homeTeamId: 1610612752, awayTeamId: 1610612755,
    homeTeamName: "Knicks", awayTeamName: "76ers",
    homeTricode: "NYK", awayTricode: "PHI",
  },
  "2025-wc2-lakers-warriors": {
    homeTeamId: 1610612747, awayTeamId: 1610612744,
    homeTeamName: "Lakers", awayTeamName: "Warriors",
    homeTricode: "LAL", awayTricode: "GSW",
  },
};

export async function seedTestSeries(): Promise<void> {
  for (const [seriesId, f] of Object.entries(TEST_SERIES_FIXTURES)) {
    await db.nbaSeries.upsert({
      where: { seriesId },
      update: {},
      create: {
        seriesId,
        homeTeamId: f.homeTeamId, awayTeamId: f.awayTeamId,
        homeTeamName: f.homeTeamName, awayTeamName: f.awayTeamName,
        homeTricode: f.homeTricode, awayTricode: f.awayTricode,
        seasonYear: "2024-25", round: 1, status: "scheduled",
      },
    });
  }
}

export { db };
