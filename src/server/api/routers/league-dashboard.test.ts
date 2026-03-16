import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createCaller } from "~/server/api/root";
import { db, makeSession } from "~/test/helpers";

function makeCaller(userId: string, role: "participant" | "commissioner" = "participant") {
  return createCaller({
    db,
    session: makeSession({ id: userId, role }),
    headers: new Headers(),
  });
}

beforeEach(async () => {
  await db.user.upsert({
    where: { id: "test-dash-user1" },
    create: { id: "test-dash-user1", email: "dash-user1@example.com", role: "participant" },
    update: { role: "participant" },
  });
  await db.user.upsert({
    where: { id: "test-dash-user2" },
    create: { id: "test-dash-user2", email: "dash-user2@example.com", role: "participant" },
    update: { role: "participant" },
  });
});

afterEach(async () => {
  await db.participant.deleteMany({ where: { userId: { startsWith: "test-dash-" } } });
  await db.league.deleteMany({ where: { createdById: { startsWith: "test-dash-" } } });
  await db.user.deleteMany({ where: { id: { startsWith: "test-dash-" } } });
});

describe("league.getMyLeagues", () => {
  it("returns empty array when user has no leagues", async () => {
    const caller = makeCaller("test-dash-user1");
    const result = await caller.league.getMyLeagues();
    expect(result).toEqual([]);
  });

  it("returns league with correct fields when user is in one league", async () => {
    await db.league.create({
      data: {
        name: "Dash Test League",
        seriesId: "2025-wc1-okc-memphis",
        clockDurationMinutes: 30,
        inviteToken: "test-dash-token-1",
        createdById: "test-dash-user1",
        participants: {
          create: { userId: "test-dash-user1", isCommissioner: true },
        },
      },
    });

    const caller = makeCaller("test-dash-user1", "commissioner");
    const result = await caller.league.getMyLeagues();

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      leagueName: "Dash Test League",
      seriesId: "2025-wc1-okc-memphis",
      participantCount: 1,
      isCommissioner: true,
    });
    expect(result[0]!.leagueId).toBeDefined();
    expect(result[0]!.joinedAt).toBeDefined();
  });

  it("returns both leagues when user is in two (one as commissioner, one as participant)", async () => {
    const league1 = await db.league.create({
      data: {
        name: "Comm League",
        seriesId: "2025-wc1-okc-memphis",
        clockDurationMinutes: 30,
        inviteToken: "test-dash-token-2a",
        createdById: "test-dash-user1",
        participants: {
          create: { userId: "test-dash-user1", isCommissioner: true },
        },
      },
    });
    const league2 = await db.league.create({
      data: {
        name: "Participant League",
        seriesId: "2025-ec1-celtics-heat",
        clockDurationMinutes: 15,
        inviteToken: "test-dash-token-2b",
        createdById: "test-dash-user2",
        participants: {
          createMany: {
            data: [
              { userId: "test-dash-user2", isCommissioner: true },
              { userId: "test-dash-user1", isCommissioner: false },
            ],
          },
        },
      },
    });

    const caller = makeCaller("test-dash-user1", "commissioner");
    const result = await caller.league.getMyLeagues();

    expect(result).toHaveLength(2);
    const comm = result.find((r) => r.leagueId === league1.id);
    const part = result.find((r) => r.leagueId === league2.id);
    expect(comm?.isCommissioner).toBe(true);
    expect(part?.isCommissioner).toBe(false);
  });

  it("does not return leagues belonging to another user", async () => {
    // user2 creates a league but does NOT add user1
    await db.league.create({
      data: {
        name: "Other User League",
        seriesId: "2025-wc2-lakers-warriors",
        clockDurationMinutes: 60,
        inviteToken: "test-dash-token-3",
        createdById: "test-dash-user2",
        participants: {
          create: { userId: "test-dash-user2", isCommissioner: true },
        },
      },
    });

    const caller = makeCaller("test-dash-user1");
    const result = await caller.league.getMyLeagues();

    expect(result).toHaveLength(0);
  });

  it("participantCount reflects total participants in the league, not just the caller", async () => {
    await db.league.create({
      data: {
        name: "Multi Participant League",
        seriesId: "2025-ec2-knicks-sixers",
        clockDurationMinutes: 45,
        inviteToken: "test-dash-token-4",
        createdById: "test-dash-user1",
        participants: {
          createMany: {
            data: [
              { userId: "test-dash-user1", isCommissioner: true },
              { userId: "test-dash-user2", isCommissioner: false },
            ],
          },
        },
      },
    });

    const caller = makeCaller("test-dash-user1", "commissioner");
    const result = await caller.league.getMyLeagues();

    expect(result).toHaveLength(1);
    expect(result[0]!.participantCount).toBe(2);
  });
});
