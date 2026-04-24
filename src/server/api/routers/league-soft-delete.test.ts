import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TRPCError } from "@trpc/server";

import { createCaller } from "~/server/api/root";
import { db, makeSession } from "~/test/helpers";

const VALID_SERIES_ID = "2026-ec1-raptors-cavaliers" as const;

function makeCommCaller(userId = "test-sd-commish") {
  return createCaller({
    db,
    session: makeSession({ id: userId, role: "commissioner" }),
    headers: new Headers(),
  });
}

function makeOtherCaller(userId = "test-sd-other") {
  return createCaller({
    db,
    session: makeSession({ id: userId, email: "other@example.com", role: "participant" }),
    headers: new Headers(),
  });
}

beforeEach(async () => {
  await db.user.upsert({
    where: { id: "test-sd-commish" },
    create: { id: "test-sd-commish", email: "sd-commish@example.com", role: "commissioner" },
    update: { role: "commissioner" },
  });
  await db.user.upsert({
    where: { id: "test-sd-other" },
    create: { id: "test-sd-other", email: "sd-other@example.com", role: "participant" },
    update: { role: "participant" },
  });
});

afterEach(async () => {
  await db.pick.deleteMany({ where: { league: { createdById: { startsWith: "test-sd-" } } } });
  await db.draftSlot.deleteMany({ where: { game: { league: { createdById: { startsWith: "test-sd-" } } } } });
  await db.game.deleteMany({ where: { league: { createdById: { startsWith: "test-sd-" } } } });
  await db.participant.deleteMany({ where: { userId: { startsWith: "test-sd-" } } });
  await db.league.deleteMany({ where: { createdById: { startsWith: "test-sd-" } } });
  await db.user.deleteMany({ where: { id: { startsWith: "test-sd-" } } });
});

async function seedLeague(name = "Soft Delete Test League") {
  const inviteToken = `test-sd-${Math.random().toString(36).slice(2)}`;
  const league = await db.league.create({
    data: {
      name,
      seriesId: VALID_SERIES_ID,
      clockDurationMinutes: 30,
      inviteToken,
      createdById: "test-sd-commish",
      participants: { create: { userId: "test-sd-commish", isCommissioner: true } },
    },
  });
  return { leagueId: league.id, inviteToken };
}

describe("league.softDeleteLeague", () => {
  it("sets deletedAt when commissioner confirms with matching name", async () => {
    const { leagueId } = await seedLeague("Deletable");
    await makeCommCaller().league.softDeleteLeague({ leagueId, confirmationName: "Deletable" });
    const league = await db.league.findUnique({ where: { id: leagueId } });
    expect(league?.deletedAt).not.toBeNull();
  });

  it("rejects confirmation name mismatch", async () => {
    const { leagueId } = await seedLeague("Mismatch League");
    let err: TRPCError | undefined;
    try {
      await makeCommCaller().league.softDeleteLeague({ leagueId, confirmationName: "Wrong" });
    } catch (e) {
      if (e instanceof TRPCError) err = e;
    }
    expect(err?.code).toBe("BAD_REQUEST");
    const league = await db.league.findUnique({ where: { id: leagueId } });
    expect(league?.deletedAt).toBeNull();
  });

  it("forbids non-commissioners by role check", async () => {
    const { leagueId } = await seedLeague("Forbidden");
    let err: TRPCError | undefined;
    try {
      await makeOtherCaller().league.softDeleteLeague({ leagueId, confirmationName: "Forbidden" });
    } catch (e) {
      if (e instanceof TRPCError) err = e;
    }
    expect(err?.code).toBe("FORBIDDEN");
  });
});

describe("soft-delete read filtering", () => {
  it("hides deleted league from getMyLeagues", async () => {
    const { leagueId } = await seedLeague("Hidden");
    await makeCommCaller().league.softDeleteLeague({ leagueId, confirmationName: "Hidden" });
    const leagues = await makeCommCaller().league.getMyLeagues();
    expect(leagues.find((l) => l.leagueId === leagueId)).toBeUndefined();
  });

  it("returns NOT_FOUND from getLeague for deleted league", async () => {
    const { leagueId } = await seedLeague("Gone");
    await makeCommCaller().league.softDeleteLeague({ leagueId, confirmationName: "Gone" });
    let err: TRPCError | undefined;
    try {
      await makeCommCaller().league.getLeague({ leagueId });
    } catch (e) {
      if (e instanceof TRPCError) err = e;
    }
    expect(err?.code).toBe("NOT_FOUND");
  });

  it("breaks invite link lookups for deleted league", async () => {
    const { leagueId, inviteToken } = await seedLeague("InviteBreak");
    await makeCommCaller().league.softDeleteLeague({ leagueId, confirmationName: "InviteBreak" });
    const result = await makeCommCaller().league.getLeagueByToken({ token: inviteToken });
    expect(result).toBeNull();
  });
});

describe("league.restoreLeague", () => {
  it("clears deletedAt and league reappears in getMyLeagues", async () => {
    const { leagueId } = await seedLeague("Reborn");
    await makeCommCaller().league.softDeleteLeague({ leagueId, confirmationName: "Reborn" });
    await makeCommCaller().league.restoreLeague({ leagueId });
    const leagues = await makeCommCaller().league.getMyLeagues();
    expect(leagues.find((l) => l.leagueId === leagueId)).toBeDefined();
  });

  it("rejects restoring a live league", async () => {
    const { leagueId } = await seedLeague("Already Live");
    let err: TRPCError | undefined;
    try {
      await makeCommCaller().league.restoreLeague({ leagueId });
    } catch (e) {
      if (e instanceof TRPCError) err = e;
    }
    expect(err?.code).toBe("BAD_REQUEST");
  });
});

describe("league.getMyDeletedLeagues", () => {
  it("returns commissioner's soft-deleted leagues only", async () => {
    const { leagueId } = await seedLeague("Trash Item");
    const initial = await makeCommCaller().league.getMyDeletedLeagues();
    expect(initial.find((l) => l.leagueId === leagueId)).toBeUndefined();

    await makeCommCaller().league.softDeleteLeague({ leagueId, confirmationName: "Trash Item" });
    const after = await makeCommCaller().league.getMyDeletedLeagues();
    expect(after.find((l) => l.leagueId === leagueId)).toBeDefined();
  });
});

describe("league.permanentlyDeleteLeague", () => {
  it("requires the league to be soft-deleted first", async () => {
    const { leagueId } = await seedLeague("Live League");
    let err: TRPCError | undefined;
    try {
      await makeCommCaller().league.permanentlyDeleteLeague({
        leagueId,
        confirmationName: "Live League",
      });
    } catch (e) {
      if (e instanceof TRPCError) err = e;
    }
    expect(err?.code).toBe("BAD_REQUEST");
  });

  it("rejects confirmation name mismatch", async () => {
    const { leagueId } = await seedLeague("Picky");
    await makeCommCaller().league.softDeleteLeague({ leagueId, confirmationName: "Picky" });
    let err: TRPCError | undefined;
    try {
      await makeCommCaller().league.permanentlyDeleteLeague({ leagueId, confirmationName: "wrong" });
    } catch (e) {
      if (e instanceof TRPCError) err = e;
    }
    expect(err?.code).toBe("BAD_REQUEST");
  });

  it("hard-deletes league and cascades to participants", async () => {
    const { leagueId } = await seedLeague("Goodbye");
    await makeCommCaller().league.softDeleteLeague({ leagueId, confirmationName: "Goodbye" });
    await makeCommCaller().league.permanentlyDeleteLeague({ leagueId, confirmationName: "Goodbye" });

    const league = await db.league.findUnique({ where: { id: leagueId } });
    expect(league).toBeNull();
    const participants = await db.participant.findMany({ where: { leagueId } });
    expect(participants).toHaveLength(0);
  });
});
