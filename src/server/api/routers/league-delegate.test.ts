import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TRPCError } from "@trpc/server";
import { createCaller } from "~/server/api/root";
import { db, makeSession } from "~/test/helpers";

function makeCommCaller(userId = "test-comm-id") {
  return createCaller({
    db,
    session: makeSession({ id: userId, role: "commissioner" }),
    headers: new Headers(),
  });
}

let testLeagueId: string;

beforeEach(async () => {
  await db.user.upsert({
    where: { id: "test-comm-id" },
    create: { id: "test-comm-id", email: "comm-delegate@example.com", role: "commissioner" },
    update: { role: "commissioner" },
  });
  await db.user.upsert({
    where: { id: "test-target-id" },
    create: { id: "test-target-id", email: "target-delegate@example.com", role: "participant" },
    update: { role: "participant" },
  });

  const league = await db.league.create({
    data: {
      name: "Delegation Test League",
      seriesId: "2025-wc1-okc-memphis",
      clockDurationMinutes: 30,
      inviteToken: "test-token-delegate",
      createdById: "test-comm-id",
      participants: {
        createMany: {
          data: [
            { userId: "test-comm-id", isCommissioner: true },
            { userId: "test-target-id", isCommissioner: false },
          ],
        },
      },
    },
  });
  testLeagueId = league.id;
});

afterEach(async () => {
  await db.participant.deleteMany({ where: { userId: { startsWith: "test-" } } });
  await db.league.deleteMany({ where: { createdById: { startsWith: "test-" } } });
  await db.user.deleteMany({ where: { id: { startsWith: "test-" } } });
});

describe("league.delegateCommissioner", () => {
  it("flips isCommissioner and promotes target User.role", async () => {
    const caller = makeCommCaller();
    const result = await caller.league.delegateCommissioner({
      leagueId: testLeagueId,
      newCommissionerId: "test-target-id",
    });
    expect(result.success).toBe(true);

    const newComm = await db.participant.findUnique({
      where: { userId_leagueId: { userId: "test-target-id", leagueId: testLeagueId } },
    });
    const oldComm = await db.participant.findUnique({
      where: { userId_leagueId: { userId: "test-comm-id", leagueId: testLeagueId } },
    });
    expect(newComm!.isCommissioner).toBe(true);
    expect(oldComm!.isCommissioner).toBe(false);

    const targetUser = await db.user.findUnique({ where: { id: "test-target-id" } });
    expect(targetUser!.role).toBe("commissioner");
  });

  it("demotes old commissioner User.role when they have no other commissioner roles", async () => {
    const caller = makeCommCaller();
    await caller.league.delegateCommissioner({
      leagueId: testLeagueId,
      newCommissionerId: "test-target-id",
    });

    const oldCommUser = await db.user.findUnique({ where: { id: "test-comm-id" } });
    expect(oldCommUser!.role).toBe("participant");
  });

  it("keeps old commissioner User.role when they still have another commissioner role", async () => {
    // Create a second league where test-comm-id is also commissioner
    const league2 = await db.league.create({
      data: {
        name: "Second League",
        seriesId: "2025-ec1-celtics-heat",
        clockDurationMinutes: 15,
        inviteToken: "test-token-delegate-2",
        createdById: "test-comm-id",
        participants: { create: { userId: "test-comm-id", isCommissioner: true } },
      },
    });

    const caller = makeCommCaller();
    await caller.league.delegateCommissioner({
      leagueId: testLeagueId,
      newCommissionerId: "test-target-id",
    });

    // Still commissioner of league2 — User.role must remain "commissioner"
    const oldCommUser = await db.user.findUnique({ where: { id: "test-comm-id" } });
    expect(oldCommUser!.role).toBe("commissioner");

    // Cleanup extra league
    await db.participant.deleteMany({ where: { leagueId: league2.id } });
    await db.league.delete({ where: { id: league2.id } });
  });

  it("throws NOT_FOUND when target is not a participant of this league", async () => {
    // Create an outsider user (not in the league)
    await db.user.upsert({
      where: { id: "test-outsider-id" },
      create: { id: "test-outsider-id", email: "outsider-delegate@example.com", role: "participant" },
      update: {},
    });

    const caller = makeCommCaller();
    let caught: TRPCError | undefined;
    try {
      await caller.league.delegateCommissioner({
        leagueId: testLeagueId,
        newCommissionerId: "test-outsider-id",
      });
    } catch (e) {
      if (e instanceof TRPCError) caught = e;
    }
    expect(caught?.code).toBe("NOT_FOUND");
  });

  it("throws FORBIDDEN when non-commissioner tries to delegate", async () => {
    const nonCommCaller = createCaller({
      db,
      session: makeSession({ id: "test-target-id", role: "participant" }),
      headers: new Headers(),
    });

    let caught: TRPCError | undefined;
    try {
      await nonCommCaller.league.delegateCommissioner({
        leagueId: testLeagueId,
        newCommissionerId: "test-comm-id",
      });
    } catch (e) {
      if (e instanceof TRPCError) caught = e;
    }
    expect(caught?.code).toBe("FORBIDDEN");
  });
});
