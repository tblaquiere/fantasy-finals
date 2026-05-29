import { describe, it, expect, afterEach, vi } from "vitest";
import {
  minLegalOffsetMinutes,
  validateOffset,
  effectiveOffset,
  revalidateOffsetsForLeague,
} from "./draft-open-schedule";
import { db, seedTestSeries } from "~/test/helpers";

const enqueueSpy = vi.fn().mockResolvedValue("job-id");
const replaceSpy = vi.fn().mockResolvedValue("job-id");

vi.mock("~/server/services/job-queue", () => ({
  enqueueJob: (...args: unknown[]) => enqueueSpy(...args),
  replaceJob: (...args: unknown[]) => replaceSpy(...args),
}));

describe("minLegalOffsetMinutes", () => {
  it("returns participants × clock + 15-min buffer", () => {
    expect(minLegalOffsetMinutes(5, 30)).toBe(165);
    expect(minLegalOffsetMinutes(1, 30)).toBe(45);
    expect(minLegalOffsetMinutes(7, 60)).toBe(435);
  });
});

describe("validateOffset", () => {
  it("ok when offset meets the minimum", () => {
    const r = validateOffset(5, 30, 165);
    expect(r.ok).toBe(true);
  });

  it("ok when offset exceeds the minimum", () => {
    const r = validateOffset(5, 30, 200);
    expect(r.ok).toBe(true);
  });

  it("rejects when offset is below the minimum and surfaces the formula", () => {
    const r = validateOffset(5, 30, 60);
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected ok=false");
    expect(r.minRequired).toBe(165);
    expect(r.message).toContain("5 participants");
    expect(r.message).toContain("30-min");
    expect(r.message).toContain("15-min buffer");
    expect(r.message).toContain("165");
  });
});

describe("effectiveOffset", () => {
  it("uses league default when game override is null", () => {
    expect(effectiveOffset({ draftOpenOffsetMinutes: null }, { draftOpenOffsetMinutes: 150 })).toBe(150);
  });

  it("uses game override when set", () => {
    expect(effectiveOffset({ draftOpenOffsetMinutes: 90 }, { draftOpenOffsetMinutes: 150 })).toBe(90);
  });

  it("handles override = 0 (zero is a valid override, not 'null')", () => {
    // edge: 0 should win over the default — caller is responsible for separately validating minimum
    expect(effectiveOffset({ draftOpenOffsetMinutes: 0 }, { draftOpenOffsetMinutes: 150 })).toBe(0);
  });
});

// ---------- AC7: revalidateOffsetsForLeague (DB-touching) ----------

const TEST_LEAGUE_NAME = "Revalidate Offsets Test";
const TEST_COMMISH = "test-revalidate-commish";
const TEST_JOINER = "test-revalidate-joiner";

async function seedLeagueWithGame(opts: {
  participantCount: number;
  clockDurationMinutes: number;
  leagueOffset: number;
  gameOffset: number | null;
  gameStatus: "pending" | "draft-open" | "active" | "final";
  tipoff: Date | null;
}) {
  await db.user.upsert({
    where: { id: TEST_COMMISH },
    create: { id: TEST_COMMISH, email: "revalidate-commish@example.com", role: "commissioner" },
    update: { role: "commissioner" },
  });
  for (let i = 1; i < opts.participantCount; i++) {
    await db.user.upsert({
      where: { id: `${TEST_JOINER}-${i}` },
      create: { id: `${TEST_JOINER}-${i}`, email: `joiner${i}@example.com`, role: "participant" },
      update: {},
    });
  }
  await seedTestSeries();

  const league = await db.league.create({
    data: {
      name: TEST_LEAGUE_NAME,
      seriesId: "2025-wc1-okc-memphis",
      clockDurationMinutes: opts.clockDurationMinutes,
      draftOpenOffsetMinutes: opts.leagueOffset,
      inviteToken: crypto.randomUUID(),
      createdById: TEST_COMMISH,
      participants: {
        create: [
          { userId: TEST_COMMISH, isCommissioner: true },
          ...Array.from({ length: opts.participantCount - 1 }, (_, i) => ({
            userId: `${TEST_JOINER}-${i + 1}`,
            isCommissioner: false,
          })),
        ],
      },
    },
  });

  const nbaGameId = `revalidate-game-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  if (opts.tipoff) {
    const series = await db.nbaSeries.findUnique({ where: { seriesId: "2025-wc1-okc-memphis" } });
    if (series) {
      await db.nbaGame.create({
        data: { nbaGameId, seriesDbId: series.id, gameDate: opts.tipoff, status: "scheduled" },
      });
    }
  }

  const game = await db.game.create({
    data: {
      leagueId: league.id,
      nbaGameId,
      gameNumber: 1,
      status: opts.gameStatus,
      draftOpenOffsetMinutes: opts.gameOffset,
      draftOpensAt: opts.tipoff
        ? new Date(opts.tipoff.getTime() - (opts.gameOffset ?? opts.leagueOffset) * 60_000)
        : null,
    },
  });

  return { league, game, nbaGameId };
}

async function cleanupRevalidate() {
  await db.boxScore.deleteMany({ where: { nbaGameId: { contains: "revalidate-game-" } } });
  await db.nbaGame.deleteMany({ where: { nbaGameId: { contains: "revalidate-game-" } } });
  await db.draftSlot.deleteMany({ where: { game: { league: { name: TEST_LEAGUE_NAME } } } });
  await db.game.deleteMany({ where: { league: { name: TEST_LEAGUE_NAME } } });
  await db.participant.deleteMany({ where: { league: { name: TEST_LEAGUE_NAME } } });
  await db.league.deleteMany({ where: { name: TEST_LEAGUE_NAME } });
  await db.user.deleteMany({ where: { id: { startsWith: TEST_JOINER } } });
  await db.user.deleteMany({ where: { id: TEST_COMMISH } });
  enqueueSpy.mockClear();
  replaceSpy.mockClear();
}

describe("revalidateOffsetsForLeague (Story 7.1 AC7)", () => {
  afterEach(async () => {
    await cleanupRevalidate();
  }, 30_000);

  it("bumps a pending game whose effective offset is now below the legal minimum (participant joined)", async () => {
    // 5 participants × 30-min clocks + 15-min buffer = 165 min minimum.
    // Game's override = 120 (was legal at 3 participants × 30 + 15 = 105, now illegal).
    const tipoff = new Date(Date.now() + 6 * 60 * 60_000);
    const { league, game } = await seedLeagueWithGame({
      participantCount: 5,
      clockDurationMinutes: 30,
      leagueOffset: 200,
      gameOffset: 120,
      gameStatus: "pending",
      tipoff,
    });

    const result = await revalidateOffsetsForLeague(db, league.id);

    expect(result.bumpedGameIds).toContain(game.id);
    const updated = await db.game.findUnique({ where: { id: game.id } });
    expect(updated?.draftOpenOffsetMinutes).toBe(165);
    expect(updated?.draftOpensAt?.getTime()).toBeCloseTo(tipoff.getTime() - 165 * 60_000, -3);
    expect(replaceSpy).toHaveBeenCalledWith(
      "draft.open",
      `draft.open:${game.id}`,
      expect.objectContaining({ gameId: game.id }),
      expect.objectContaining({ startAfter: expect.any(Date) as unknown as Date }),
    );
    // One commissioner notification per pass (batched across all bumped games)
    const notifCalls = enqueueSpy.mock.calls.filter(
      ([name, payload]) =>
        name === "notification.send" &&
        (payload as { type?: string }).type === "draft-offset-bumped",
    );
    expect(notifCalls).toHaveLength(1);
    expect(notifCalls[0]?.[1]).toMatchObject({ leagueId: league.id });
  }, 30_000);

  it("no-ops when no game's effective offset is below the legal minimum", async () => {
    // 3 participants × 30 + 15 = 105 min minimum. Game uses league default of 150. Legal.
    const tipoff = new Date(Date.now() + 6 * 60 * 60_000);
    const { league, game } = await seedLeagueWithGame({
      participantCount: 3,
      clockDurationMinutes: 30,
      leagueOffset: 150,
      gameOffset: null,
      gameStatus: "pending",
      tipoff,
    });

    const result = await revalidateOffsetsForLeague(db, league.id);

    expect(result.bumpedGameIds).toEqual([]);
    expect(replaceSpy).not.toHaveBeenCalled();
    const after = await db.game.findUnique({ where: { id: game.id } });
    expect(after?.draftOpenOffsetMinutes).toBeNull();
    expect(after?.draftOpensAt?.getTime()).toBe(tipoff.getTime() - 150 * 60_000);
  }, 30_000);

  it("does not bump games whose status is no longer pending (don't disrupt in-progress drafts)", async () => {
    // Offset is illegal under the current participant count, but the draft is already open.
    const tipoff = new Date(Date.now() + 6 * 60 * 60_000);
    const { league, game } = await seedLeagueWithGame({
      participantCount: 5,
      clockDurationMinutes: 30,
      leagueOffset: 200,
      gameOffset: 60,
      gameStatus: "draft-open",
      tipoff,
    });

    const result = await revalidateOffsetsForLeague(db, league.id);

    expect(result.bumpedGameIds).toEqual([]);
    expect(replaceSpy).not.toHaveBeenCalled();
    const after = await db.game.findUnique({ where: { id: game.id } });
    expect(after?.draftOpenOffsetMinutes).toBe(60); // untouched
  }, 30_000);
});
