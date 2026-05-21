import { describe, it, expect, afterEach } from "vitest";
import type { Job } from "pg-boss";

import { db, seedTestSeries } from "~/test/helpers";
import {
  handleDraftOpen,
  type DraftOpenPayload,
} from "./draft-open";

const TEST_USER = "test-draftopen-user";
const TEST_LEAGUE_NAME = "Draft Open Idempotency Test";

async function setupLeagueWithGame(status: "pending" | "draft-open" | "active" | "final") {
  await db.user.upsert({
    where: { id: TEST_USER },
    create: { id: TEST_USER, email: "draftopen@example.com", role: "commissioner" },
    update: { role: "commissioner" },
  });
  await seedTestSeries();

  const league = await db.league.create({
    data: {
      name: TEST_LEAGUE_NAME,
      seriesId: "2025-wc1-okc-memphis",
      clockDurationMinutes: 30,
      inviteToken: crypto.randomUUID(),
      createdById: TEST_USER,
      participants: { create: { userId: TEST_USER, isCommissioner: true } },
    },
  });
  const game = await db.game.create({
    data: {
      leagueId: league.id,
      nbaGameId: `test-game-${Date.now()}`,
      gameNumber: 1,
      status,
    },
  });
  return { league, game };
}

async function cleanup() {
  await db.draftSlot.deleteMany({ where: { game: { league: { name: TEST_LEAGUE_NAME } } } });
  await db.game.deleteMany({ where: { league: { name: TEST_LEAGUE_NAME } } });
  await db.participant.deleteMany({ where: { userId: TEST_USER } });
  await db.league.deleteMany({ where: { name: TEST_LEAGUE_NAME } });
  await db.user.deleteMany({ where: { id: TEST_USER } });
}

function fakeJob(gameId: string, leagueId: string): Job<DraftOpenPayload>[] {
  return [
    {
      id: crypto.randomUUID(),
      name: "draft.open",
      data: { leagueId, gameId },
    } as unknown as Job<DraftOpenPayload>,
  ];
}

describe("handleDraftOpen — idempotency (Story 7.1 AC5)", () => {
  // Each test does several round-trips to a remote DB (setup + cleanup).
  // Bumping the default 5s timeout so transient network jitter doesn't
  // mark a working idempotency check as a regression.
  afterEach(async () => {
    await cleanup();
  }, 20_000);

  it("no-ops when game status is draft-open", async () => {
    const { league, game } = await setupLeagueWithGame("draft-open");
    await handleDraftOpen(fakeJob(game.id, league.id));
    const after = await db.game.findUnique({ where: { id: game.id } });
    expect(after?.status).toBe("draft-open"); // unchanged
  }, 20_000);

  it("no-ops when game status is active", async () => {
    const { league, game } = await setupLeagueWithGame("active");
    await handleDraftOpen(fakeJob(game.id, league.id));
    const after = await db.game.findUnique({ where: { id: game.id } });
    expect(after?.status).toBe("active"); // unchanged
  }, 20_000);

  it("no-ops when game status is final", async () => {
    const { league, game } = await setupLeagueWithGame("final");
    await handleDraftOpen(fakeJob(game.id, league.id));
    const after = await db.game.findUnique({ where: { id: game.id } });
    expect(after?.status).toBe("final"); // unchanged
  }, 20_000);
});
