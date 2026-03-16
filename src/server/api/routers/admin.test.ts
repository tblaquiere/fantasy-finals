import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createCaller } from "~/server/api/root";
import { db, makeSession } from "~/test/helpers";

function makeCaller(userId: string, role: "participant" | "commissioner" | "admin" = "participant") {
  return createCaller({
    db,
    session: makeSession({ id: userId, role }),
    headers: new Headers(),
  });
}

beforeEach(async () => {
  await db.user.upsert({
    where: { id: "test-admin-user1" },
    create: { id: "test-admin-user1", email: "admin@example.com", role: "admin" },
    update: { role: "admin" },
  });
  await db.user.upsert({
    where: { id: "test-admin-user2" },
    create: { id: "test-admin-user2", email: "comm@example.com", role: "commissioner" },
    update: { role: "commissioner" },
  });
  await db.user.upsert({
    where: { id: "test-admin-user3" },
    create: { id: "test-admin-user3", email: "part@example.com", role: "participant" },
    update: { role: "participant" },
  });
});

afterEach(async () => {
  await db.participant.deleteMany({ where: { userId: { startsWith: "test-admin-" } } });
  await db.league.deleteMany({ where: { createdById: { startsWith: "test-admin-" } } });
  await db.user.deleteMany({ where: { id: { startsWith: "test-admin-" } } });
});

describe("league.getAllLeagues", () => {
  it("admin sees all leagues including ones they are not a member of", async () => {
    // user2 (commissioner) creates a league — admin is NOT a member
    const commCaller = makeCaller("test-admin-user2", "commissioner");
    await commCaller.league.createLeague({
      name: "Admin Test League",
      seriesId: "2025-wc1-okc-memphis",
      clockDurationMinutes: 30,
    });

    const adminCaller = makeCaller("test-admin-user1", "admin");
    const result = await adminCaller.league.getAllLeagues();

    const found = result.find((l) => l.leagueName === "Admin Test League");
    expect(found).toBeDefined();
    expect(found!.leagueId).toBeTruthy();
  });

  it("returns FORBIDDEN for participant role", async () => {
    const caller = makeCaller("test-admin-user3", "participant");
    let code: string | undefined;
    try {
      await caller.league.getAllLeagues();
    } catch (e: unknown) {
      if (typeof e === "object" && e !== null && "code" in e) {
        code = (e as { code: string }).code;
      }
    }
    expect(code).toBe("FORBIDDEN");
  });

  it("returns FORBIDDEN for commissioner role", async () => {
    const caller = makeCaller("test-admin-user2", "commissioner");
    let code: string | undefined;
    try {
      await caller.league.getAllLeagues();
    } catch (e: unknown) {
      if (typeof e === "object" && e !== null && "code" in e) {
        code = (e as { code: string }).code;
      }
    }
    expect(code).toBe("FORBIDDEN");
  });

  it("returns correct commissioner and participantCount fields", async () => {
    const commCaller = makeCaller("test-admin-user2", "commissioner");
    await commCaller.league.createLeague({
      name: "Fields Test League",
      seriesId: "2025-ec1-celtics-heat",
      clockDurationMinutes: 15,
    });

    // Add user3 as a participant
    const league = await db.league.findFirst({ where: { name: "Fields Test League" } });
    expect(league).toBeTruthy();
    await db.participant.create({
      data: { userId: "test-admin-user3", leagueId: league!.id, isCommissioner: false },
    });

    const adminCaller = makeCaller("test-admin-user1", "admin");
    const result = await adminCaller.league.getAllLeagues();
    const found = result.find((l) => l.leagueName === "Fields Test League");

    expect(found).toBeDefined();
    expect(found!.participantCount).toBe(2);
    expect(found!.commissioner?.email).toBe("comm@example.com");
  });
});

describe("admin.recalculateDraftOrder", () => {
  it("admin receives not_available stub response", async () => {
    const commCaller = makeCaller("test-admin-user2", "commissioner");
    const { leagueId } = await commCaller.league.createLeague({
      name: "Recalc Test League",
      seriesId: "2025-wc2-lakers-warriors",
      clockDurationMinutes: 30,
    });

    const adminCaller = makeCaller("test-admin-user1", "admin");
    const result = await adminCaller.admin.recalculateDraftOrder({ leagueId });
    expect(result.status).toBe("not_available");
    expect(result.message).toContain("Epic 3");
  });

  it("returns FORBIDDEN for non-admin", async () => {
    const commCaller = makeCaller("test-admin-user2", "commissioner");
    const { leagueId } = await commCaller.league.createLeague({
      name: "Recalc Forbidden League",
      seriesId: "2025-ec2-knicks-sixers",
      clockDurationMinutes: 45,
    });

    const partCaller = makeCaller("test-admin-user3", "participant");
    let code: string | undefined;
    try {
      await partCaller.admin.recalculateDraftOrder({ leagueId });
    } catch (e: unknown) {
      if (typeof e === "object" && e !== null && "code" in e) {
        code = (e as { code: string }).code;
      }
    }
    expect(code).toBe("FORBIDDEN");
  });

  it("returns NOT_FOUND for non-existent leagueId", async () => {
    const adminCaller = makeCaller("test-admin-user1", "admin");
    let code: string | undefined;
    try {
      await adminCaller.admin.recalculateDraftOrder({ leagueId: "non-existent-id" });
    } catch (e: unknown) {
      if (typeof e === "object" && e !== null && "code" in e) {
        code = (e as { code: string }).code;
      }
    }
    expect(code).toBe("NOT_FOUND");
  });
});
