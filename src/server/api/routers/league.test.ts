import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TRPCError } from "@trpc/server";

import { createCaller } from "~/server/api/root";
import { db, makeSession } from "~/test/helpers";

function makeCaller(session = makeSession()) {
  return createCaller({ db, session, headers: new Headers() });
}

function makeAnonCaller() {
  return createCaller({ db, session: null, headers: new Headers() });
}

beforeEach(async () => {
  // Ensure primary test user exists before each test
  await db.user.upsert({
    where: { id: "test-user-id" },
    create: { id: "test-user-id", email: "test@example.com", role: "participant" },
    update: { role: "participant" },
  });
});

afterEach(async () => {
  // Delete in reverse dependency order
  await db.participant.deleteMany({ where: { userId: { startsWith: "test-" } } });
  await db.league.deleteMany({ where: { createdById: { startsWith: "test-" } } });
  await db.user.deleteMany({ where: { id: { startsWith: "test-" } } });
});

describe("league.createLeague", () => {
  it("creates league, adds creator as commissioner participant, and promotes user role", async () => {
    const caller = makeCaller();
    const result = await caller.league.createLeague({
      name: "Test League",
      seriesId: "2025-wc1-okc-memphis",
      clockDurationMinutes: 30,
    });

    expect(result.leagueId).toBeTruthy();

    // Verify league was created
    const league = await db.league.findUnique({ where: { id: result.leagueId } });
    expect(league?.name).toBe("Test League");
    expect(league?.seriesId).toBe("2025-wc1-okc-memphis");
    expect(league?.clockDurationMinutes).toBe(30);
    expect(league?.createdById).toBe("test-user-id");

    // Verify creator was added as commissioner participant
    const participant = await db.participant.findFirst({ where: { leagueId: result.leagueId } });
    expect(participant?.isCommissioner).toBe(true);
    expect(participant?.userId).toBe("test-user-id");

    // Verify user role was promoted to commissioner
    const user = await db.user.findUnique({ where: { id: "test-user-id" } });
    expect(user?.role).toBe("commissioner");
  });

  it("throws UNAUTHORIZED when caller is not authenticated", async () => {
    const caller = makeAnonCaller();
    let caughtError: TRPCError | undefined;
    try {
      await caller.league.createLeague({
        name: "Test League",
        seriesId: "2025-wc1-okc-memphis",
        clockDurationMinutes: 30,
      });
    } catch (e) {
      if (e instanceof TRPCError) caughtError = e;
    }
    expect(caughtError).toBeInstanceOf(TRPCError);
    expect(caughtError?.code).toBe("UNAUTHORIZED");
  });
});

describe("league.getLeague", () => {
  it("allows a member to read their league", async () => {
    const caller = makeCaller();
    const { leagueId } = await caller.league.createLeague({
      name: "Member Test League",
      seriesId: "2025-ec1-celtics-heat",
      clockDurationMinutes: 15,
    });

    const league = await caller.league.getLeague({ leagueId });
    expect(league.id).toBe(leagueId);
    expect(league.name).toBe("Member Test League");
    expect(league.participants).toHaveLength(1);
    expect(league.participants[0]?.isCommissioner).toBe(true);
  });

  it("throws FORBIDDEN when caller is not a member", async () => {
    const ownerCaller = makeCaller();
    const { leagueId } = await ownerCaller.league.createLeague({
      name: "Private League",
      seriesId: "2025-ec2-knicks-sixers",
      clockDurationMinutes: 60,
    });

    // Create a non-member user and caller
    await db.user.upsert({
      where: { id: "test-outsider-id" },
      create: { id: "test-outsider-id", email: "outsider@example.com", role: "participant" },
      update: {},
    });
    const outsiderCaller = makeCaller(makeSession({ id: "test-outsider-id", email: "outsider@example.com" }));

    let caughtError: TRPCError | undefined;
    try {
      await outsiderCaller.league.getLeague({ leagueId });
    } catch (e) {
      if (e instanceof TRPCError) caughtError = e;
    }
    expect(caughtError?.code).toBe("FORBIDDEN");
  });
});
