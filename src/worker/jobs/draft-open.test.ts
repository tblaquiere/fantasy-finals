import { describe, it, expect, afterEach, vi } from "vitest";
import type { Job } from "pg-boss";

import { db, seedTestSeries } from "~/test/helpers";
import {
  handleDraftOpen,
  type DraftOpenPayload,
} from "./draft-open";

const enqueueSpy = vi.fn().mockResolvedValue("job-id");
vi.mock("~/server/services/job-queue", () => ({
  enqueueJob: (...args: unknown[]) => enqueueSpy(...args),
}));

const TEST_USER = "test-draftopen-user";
const TEST_LEAGUE_NAME = "Draft Open Idempotency Test";

async function setupLeagueWithGame(
  status: "pending" | "draft-open" | "active" | "final",
  opts: { withSlots?: boolean; draftOrderProvisional?: boolean } = {},
) {
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
    include: { participants: true },
  });
  const game = await db.game.create({
    data: {
      leagueId: league.id,
      nbaGameId: `test-game-${Date.now()}`,
      gameNumber: 1,
      status,
      draftOrderProvisional: opts.draftOrderProvisional ?? true,
    },
  });
  if (opts.withSlots) {
    await db.draftSlot.create({
      data: {
        gameId: game.id,
        participantId: league.participants[0]!.id,
        pickPosition: 1,
      },
    });
  }
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
    enqueueSpy.mockClear();
  }, 20_000);

  it("happy path: pending → draft-open, starts clock, enqueues clock.expire + notifications", async () => {
    const { league, game } = await setupLeagueWithGame("pending", { withSlots: true });
    const before = Date.now();
    await handleDraftOpen(fakeJob(game.id, league.id));

    const after = await db.game.findUnique({ where: { id: game.id } });
    expect(after?.status).toBe("draft-open");
    // Story 7.4: opening the draft locks the order
    expect(after?.draftOrderProvisional).toBe(false);

    const slot = await db.draftSlot.findFirst({ where: { gameId: game.id } });
    expect(slot?.clockStartsAt).toBeInstanceOf(Date);
    expect(slot?.clockExpiresAt).toBeInstanceOf(Date);
    // 30-min clock from league.clockDurationMinutes
    const elapsedMs = (slot!.clockExpiresAt!.getTime() - slot!.clockStartsAt!.getTime());
    expect(elapsedMs).toBe(30 * 60 * 1000);
    // clockStartsAt is "now"-ish — within the wall-clock window of the test
    expect(slot!.clockStartsAt!.getTime()).toBeGreaterThanOrEqual(before);

    // Assert the side-effect enqueues fired
    const calls = enqueueSpy.mock.calls.map(([name, payload]) => ({ name, payload }));
    expect(calls.some((c) => c.name === "clock.expire")).toBe(true);
    expect(
      calls.some(
        (c) =>
          c.name === "notification.send" &&
          (c.payload as { type?: string }).type === "draft-open",
      ),
    ).toBe(true);
    expect(
      calls.some(
        (c) =>
          c.name === "notification.send" &&
          (c.payload as { type?: string }).type === "your-turn",
      ),
    ).toBe(true);
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
