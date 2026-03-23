import { describe, it, expect } from "vitest";
import {
  isPlayerActive,
  isPlayerEligibleForDraft,
  isPlayerEligibleForMozgov,
} from "./eligibility";
import { type NbaPlayerStats } from "./nba-stats";

function makePlayer(overrides: Partial<NbaPlayerStats> = {}): NbaPlayerStats {
  return {
    personId: 1629029,
    firstName: "Shai",
    familyName: "Gilgeous-Alexander",
    jerseyNum: "2",
    position: "G",
    teamId: 1610612760,
    teamTricode: "OKC",
    minutes: 25,
    points: 18,
    reboundsTotal: 3,
    assists: 5,
    steals: 2,
    blocks: 0,
    status: "ACTIVE",
    ...overrides,
  };
}

describe("isPlayerActive", () => {
  it("returns true for ACTIVE status", () => {
    expect(isPlayerActive(makePlayer({ status: "ACTIVE" }))).toBe(true);
  });

  it("returns false for INACTIVE status", () => {
    expect(isPlayerActive(makePlayer({ status: "INACTIVE" }))).toBe(false);
  });
});

describe("isPlayerEligibleForDraft", () => {
  it("returns true when all conditions met", () => {
    const player = makePlayer({ personId: 100 });
    expect(isPlayerEligibleForDraft(player, new Set(), new Set())).toBe(true);
  });

  it("returns false if player is inactive", () => {
    const player = makePlayer({ personId: 100, status: "INACTIVE" });
    expect(isPlayerEligibleForDraft(player, new Set(), new Set())).toBe(false);
  });

  it("returns false if player was used by this participant in the series", () => {
    const player = makePlayer({ personId: 100 });
    expect(isPlayerEligibleForDraft(player, new Set([100]), new Set())).toBe(false);
  });

  it("returns false if player was already picked in this game", () => {
    const player = makePlayer({ personId: 100 });
    expect(isPlayerEligibleForDraft(player, new Set(), new Set([100]))).toBe(false);
  });

  it("returns false when both used and picked", () => {
    const player = makePlayer({ personId: 100 });
    expect(isPlayerEligibleForDraft(player, new Set([100]), new Set([100]))).toBe(false);
  });

  it("allows picking a player used by OTHER participants", () => {
    const player = makePlayer({ personId: 100 });
    // personId 100 is NOT in this participant's usedPlayerIds
    // personId 100 is NOT in the current game's pickedPlayerIds
    expect(isPlayerEligibleForDraft(player, new Set([200, 300]), new Set([200]))).toBe(true);
  });
});

describe("isPlayerEligibleForMozgov", () => {
  it("returns true when all conditions met (5+ min in recent game)", () => {
    const player = makePlayer({ personId: 100 });
    expect(isPlayerEligibleForMozgov(player, new Set(), 20)).toBe(true);
  });

  it("returns true with exactly 5 minutes in recent game", () => {
    const player = makePlayer({ personId: 100 });
    expect(isPlayerEligibleForMozgov(player, new Set(), 5)).toBe(true);
  });

  it("returns false if player is inactive", () => {
    const player = makePlayer({ personId: 100, status: "INACTIVE" });
    expect(isPlayerEligibleForMozgov(player, new Set(), 20)).toBe(false);
  });

  it("returns false if player played < 5 min in recent game", () => {
    const player = makePlayer({ personId: 100 });
    expect(isPlayerEligibleForMozgov(player, new Set(), 4)).toBe(false);
  });

  it("returns false if player has no prior games (null)", () => {
    const player = makePlayer({ personId: 100 });
    expect(isPlayerEligibleForMozgov(player, new Set(), null)).toBe(false);
  });

  it("returns false if player was already used in this series", () => {
    const player = makePlayer({ personId: 100 });
    expect(isPlayerEligibleForMozgov(player, new Set([100]), 20)).toBe(false);
  });
});
