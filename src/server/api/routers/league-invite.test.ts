import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TRPCError } from "@trpc/server";

import { createCaller } from "~/server/api/root";
import { db, makeSession } from "~/test/helpers";

function makeCaller(session = makeSession({ role: "commissioner" })) {
  return createCaller({ db, session, headers: new Headers() });
}

beforeEach(async () => {
  await db.user.upsert({
    where: { id: "test-user-id" },
    create: { id: "test-user-id", email: "test@example.com", role: "commissioner" },
    update: { role: "commissioner" },
  });
});

afterEach(async () => {
  await db.participant.deleteMany({ where: { userId: { startsWith: "test-" } } });
  await db.league.deleteMany({ where: { createdById: { startsWith: "test-" } } });
  await db.user.deleteMany({ where: { id: { startsWith: "test-" } } });
});

async function createTestLeague(caller: ReturnType<typeof makeCaller>) {
  return caller.league.createLeague({
    name: "Invite Test League",
    seriesId: "2025-wc1-okc-memphis",
    clockDurationMinutes: 30,
  });
}

describe("league.getInviteToken", () => {
  it("commissioner can read their league's invite token", async () => {
    const caller = makeCaller();
    const { leagueId } = await createTestLeague(caller);

    const result = await caller.league.getInviteToken({ leagueId });
    expect(result.token).toBeTruthy();
    expect(typeof result.token).toBe("string");
  });

  it("invite token is auto-generated when league is created", async () => {
    const caller = makeCaller();
    const { leagueId } = await createTestLeague(caller);

    const league = await db.league.findUnique({ where: { id: leagueId } });
    expect(league?.inviteToken).toBeTruthy();
  });

  it("throws FORBIDDEN for non-commissioner participant", async () => {
    const commCaller = makeCaller();
    const { leagueId } = await createTestLeague(commCaller);

    await db.user.upsert({
      where: { id: "test-outsider-id" },
      create: { id: "test-outsider-id", email: "outsider@example.com", role: "participant" },
      update: {},
    });
    const outsiderCaller = makeCaller(
      makeSession({ id: "test-outsider-id", role: "participant" }),
    );

    let caught: TRPCError | undefined;
    try {
      await outsiderCaller.league.getInviteToken({ leagueId });
    } catch (e) {
      if (e instanceof TRPCError) caught = e;
    }
    expect(caught?.code).toBe("FORBIDDEN");
  });

  it("throws FORBIDDEN for commissioner of a different league", async () => {
    const commCaller = makeCaller();
    const { leagueId } = await createTestLeague(commCaller);

    await db.user.upsert({
      where: { id: "test-other-comm-id" },
      create: { id: "test-other-comm-id", email: "other@example.com", role: "commissioner" },
      update: { role: "commissioner" },
    });
    const otherCommCaller = makeCaller(
      makeSession({ id: "test-other-comm-id", role: "commissioner" }),
    );

    let caught: TRPCError | undefined;
    try {
      await otherCommCaller.league.getInviteToken({ leagueId });
    } catch (e) {
      if (e instanceof TRPCError) caught = e;
    }
    expect(caught?.code).toBe("FORBIDDEN");
  });
});

describe("league.regenerateInviteToken", () => {
  it("commissioner can regenerate and replaces old token", async () => {
    const caller = makeCaller();
    const { leagueId } = await createTestLeague(caller);

    const { token: firstToken } = await caller.league.getInviteToken({ leagueId });

    const { token: newToken } = await caller.league.regenerateInviteToken({ leagueId });
    expect(newToken).toBeTruthy();
    expect(newToken).not.toBe(firstToken);

    // DB reflects new token
    const league = await db.league.findUnique({ where: { id: leagueId } });
    expect(league?.inviteToken).toBe(newToken);
  });

  it("throws FORBIDDEN for non-commissioner", async () => {
    const commCaller = makeCaller();
    const { leagueId } = await createTestLeague(commCaller);

    await db.user.upsert({
      where: { id: "test-outsider-id" },
      create: { id: "test-outsider-id", email: "outsider@example.com", role: "participant" },
      update: {},
    });
    const outsiderCaller = makeCaller(
      makeSession({ id: "test-outsider-id", role: "participant" }),
    );

    let caught: TRPCError | undefined;
    try {
      await outsiderCaller.league.regenerateInviteToken({ leagueId });
    } catch (e) {
      if (e instanceof TRPCError) caught = e;
    }
    expect(caught?.code).toBe("FORBIDDEN");
  });
});
