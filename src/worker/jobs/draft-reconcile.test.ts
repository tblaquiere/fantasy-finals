import { describe, it, expect, afterEach, vi } from "vitest";
import type { Job } from "pg-boss";

import { db, seedTestSeries } from "~/test/helpers";
import { handleDraftReconcile, type DraftReconcilePayload } from "./draft-reconcile";

// Stub the job-queue module so the test never reaches a real pg-boss instance.
// We assert by spying on these mocks. Spies are explicitly typed so ESLint's
// no-unsafe-return / no-unsafe-assignment rules don't flag the mock factory.
type EnqueueFn = (
  name: string,
  payload: unknown,
  options?: unknown,
) => Promise<string | null>;
const enqueueSpy = vi.fn<EnqueueFn>();
const replaceSpy = vi.fn<EnqueueFn>();
enqueueSpy.mockResolvedValue("job-id");
replaceSpy.mockResolvedValue("job-id");

vi.mock("~/server/services/job-queue", () => ({
  enqueueJob: (...args: Parameters<EnqueueFn>) => enqueueSpy(...args),
  replaceJob: (...args: Parameters<EnqueueFn>) => replaceSpy(...args),
}));

const TEST_USER = "test-reconcile-user";
const TEST_LEAGUE_NAME = "Draft Reconcile Test";

async function seed(opts: {
  status: "pending" | "draft-open" | "active" | "final";
  draftOpensAt: Date | null;
  tipoffUTC: Date | null;
  offsetOverride?: number | null;
}) {
  await db.user.upsert({
    where: { id: TEST_USER },
    create: { id: TEST_USER, email: "reconcile@example.com", role: "commissioner" },
    update: { role: "commissioner" },
  });
  await seedTestSeries();

  const league = await db.league.create({
    data: {
      name: TEST_LEAGUE_NAME,
      seriesId: "2025-wc1-okc-memphis",
      clockDurationMinutes: 30,
      draftOpenOffsetMinutes: 150,
      inviteToken: crypto.randomUUID(),
      createdById: TEST_USER,
      participants: { create: { userId: TEST_USER, isCommissioner: true } },
    },
  });

  const nbaGameId = `reconcile-game-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const game = await db.game.create({
    data: {
      leagueId: league.id,
      nbaGameId,
      gameNumber: 1,
      status: opts.status,
      draftOpensAt: opts.draftOpensAt,
      draftOpenOffsetMinutes: opts.offsetOverride ?? null,
    },
  });

  if (opts.tipoffUTC) {
    const series = await db.nbaSeries.findUnique({ where: { seriesId: "2025-wc1-okc-memphis" } });
    if (series) {
      await db.nbaGame.upsert({
        where: { nbaGameId },
        update: { gameDate: opts.tipoffUTC },
        create: {
          nbaGameId,
          seriesDbId: series.id,
          gameDate: opts.tipoffUTC,
          status: "scheduled",
        },
      });
    }
  }

  return { league, game, nbaGameId };
}

async function cleanup() {
  await db.boxScore.deleteMany({ where: { nbaGameId: { contains: "reconcile-game-" } } });
  await db.nbaGame.deleteMany({ where: { nbaGameId: { contains: "reconcile-game-" } } });
  await db.draftSlot.deleteMany({ where: { game: { league: { name: TEST_LEAGUE_NAME } } } });
  await db.game.deleteMany({ where: { league: { name: TEST_LEAGUE_NAME } } });
  await db.participant.deleteMany({ where: { userId: TEST_USER } });
  await db.league.deleteMany({ where: { name: TEST_LEAGUE_NAME } });
  await db.user.deleteMany({ where: { id: TEST_USER } });
  enqueueSpy.mockClear();
  replaceSpy.mockClear();
}

function fakeJob(): Job<DraftReconcilePayload>[] {
  return [
    {
      id: crypto.randomUUID(),
      name: "draft.reconcile",
      data: {},
    } as unknown as Job<DraftReconcilePayload>,
  ];
}

describe("handleDraftReconcile (Story 7.1 AC6)", () => {
  afterEach(async () => {
    await cleanup();
  }, 30_000);

  // The reconcile handler iterates ALL pending games in the DB, including
  // any existing production data. We assert by checking that replaceJob
  // was (or wasn't) called specifically for OUR test game id, rather than
  // by total call count.
  function calledForGame(gameId: string): boolean {
    return replaceSpy.mock.calls.some(
      ([, , payload]) =>
        typeof payload === "object" &&
        payload !== null &&
        (payload as { gameId?: string }).gameId === gameId,
    );
  }

  it("re-enqueues when NBA tipoff drifted more than 5 minutes", async () => {
    const now = new Date();
    const oldTipoff = new Date(now.getTime() + 3 * 60 * 60_000);
    const newTipoff = new Date(now.getTime() + 3.5 * 60 * 60_000);
    const oldDraftOpensAt = new Date(oldTipoff.getTime() - 150 * 60_000);
    const { game } = await seed({
      status: "pending",
      draftOpensAt: oldDraftOpensAt,
      tipoffUTC: newTipoff,
    });

    await handleDraftReconcile(fakeJob());

    expect(calledForGame(game.id)).toBe(true);
    const updated = await db.game.findUnique({ where: { id: game.id } });
    expect(updated?.draftOpensAt?.getTime()).toBeCloseTo(
      newTipoff.getTime() - 150 * 60_000,
      -3, // within 1s
    );
  }, 30_000);

  it("does NOT re-enqueue when tipoff drift is under 5 minutes", async () => {
    const now = new Date();
    const tipoff = new Date(now.getTime() + 3 * 60 * 60_000);
    const draftOpensAt = new Date(tipoff.getTime() - 150 * 60_000);
    const { game } = await seed({
      status: "pending",
      draftOpensAt,
      tipoffUTC: tipoff,
    });

    await handleDraftReconcile(fakeJob());

    expect(calledForGame(game.id)).toBe(false);
  }, 30_000);

  it("skips games whose status is no longer pending", async () => {
    const now = new Date();
    const tipoff = new Date(now.getTime() + 3 * 60 * 60_000);
    const oldDraftOpensAt = new Date(tipoff.getTime() - 90 * 60_000);
    const { game } = await seed({
      status: "draft-open",
      draftOpensAt: oldDraftOpensAt,
      tipoffUTC: tipoff,
    });

    await handleDraftReconcile(fakeJob());

    expect(calledForGame(game.id)).toBe(false);
  }, 30_000);

  it("skips games with no known tipoff (NbaGame.gameDate missing)", async () => {
    const now = new Date();
    const draftOpensAt = new Date(now.getTime() + 1 * 60 * 60_000);
    const { game } = await seed({
      status: "pending",
      draftOpensAt,
      tipoffUTC: null,
    });

    await handleDraftReconcile(fakeJob());

    expect(calledForGame(game.id)).toBe(false);
  }, 30_000);

  it("re-enqueues the next reconcile pass (self-schedule)", async () => {
    await handleDraftReconcile(fakeJob());
    expect(enqueueSpy).toHaveBeenCalledWith(
      "draft.reconcile",
      {},
      expect.objectContaining({ singletonKey: "draft.reconcile:singleton" }),
    );
  }, 30_000);
});
