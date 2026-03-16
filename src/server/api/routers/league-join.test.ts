import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TRPCError } from "@trpc/server";
import { createCaller } from "~/server/api/root";
import { db, makeSession } from "~/test/helpers";

function makePublicCaller() {
  return createCaller({ db, session: null, headers: new Headers() });
}

function makeCaller(session = makeSession()) {
  return createCaller({ db, session, headers: new Headers() });
}

let testLeagueId: string;
const TEST_INVITE_TOKEN = "test-invite-token-join";

beforeEach(async () => {
  // Create commissioner user
  await db.user.upsert({
    where: { id: "test-comm-id" },
    create: { id: "test-comm-id", email: "comm-join@example.com", role: "commissioner" },
    update: { role: "commissioner" },
  });

  // Create league with known invite token
  const league = await db.league.create({
    data: {
      name: "Join Test League",
      seriesId: "2025-wc1-okc-memphis",
      clockDurationMinutes: 30,
      inviteToken: TEST_INVITE_TOKEN,
      createdById: "test-comm-id",
      participants: { create: { userId: "test-comm-id", isCommissioner: true } },
    },
  });
  testLeagueId = league.id;

  // Create joiner user
  await db.user.upsert({
    where: { id: "test-joiner-id" },
    create: { id: "test-joiner-id", email: "joiner@example.com", role: "participant" },
    update: { role: "participant" },
  });
});

afterEach(async () => {
  await db.participant.deleteMany({ where: { userId: { startsWith: "test-" } } });
  await db.league.deleteMany({ where: { createdById: { startsWith: "test-" } } });
  await db.user.deleteMany({ where: { id: { startsWith: "test-" } } });
});

describe("league.getLeagueByToken", () => {
  it("returns league info for valid token", async () => {
    const caller = makePublicCaller();
    const result = await caller.league.getLeagueByToken({ token: TEST_INVITE_TOKEN });
    expect(result).not.toBeNull();
    expect(result!.name).toBe("Join Test League");
    expect(result!.seriesId).toBe("2025-wc1-okc-memphis");
    expect(result!.participantCount).toBe(1);
  });

  it("returns null for invalid token", async () => {
    const caller = makePublicCaller();
    const result = await caller.league.getLeagueByToken({ token: "nonexistent-token" });
    expect(result).toBeNull();
  });
});

describe("league.joinLeague", () => {
  it("joins league successfully", async () => {
    const caller = makeCaller(makeSession({ id: "test-joiner-id" }));
    const result = await caller.league.joinLeague({ token: TEST_INVITE_TOKEN });
    expect(result.leagueId).toBe(testLeagueId);
    expect(result.alreadyMember).toBe(false);

    // Verify participant record created
    const participant = await db.participant.findUnique({
      where: { userId_leagueId: { userId: "test-joiner-id", leagueId: testLeagueId } },
    });
    expect(participant).not.toBeNull();
    expect(participant!.isCommissioner).toBe(false);
  });

  it("returns alreadyMember for duplicate join", async () => {
    const caller = makeCaller(makeSession({ id: "test-joiner-id" }));
    // Join once
    await caller.league.joinLeague({ token: TEST_INVITE_TOKEN });
    // Join again — should not throw
    const result = await caller.league.joinLeague({ token: TEST_INVITE_TOKEN });
    expect(result.alreadyMember).toBe(true);
    expect(result.leagueId).toBe(testLeagueId);
  });

  it("throws NOT_FOUND for invalid token", async () => {
    const caller = makeCaller(makeSession({ id: "test-joiner-id" }));
    let caught: TRPCError | undefined;
    try {
      await caller.league.joinLeague({ token: "nonexistent-token" });
    } catch (e) {
      if (e instanceof TRPCError) caught = e;
    }
    expect(caught?.code).toBe("NOT_FOUND");
  });
});
