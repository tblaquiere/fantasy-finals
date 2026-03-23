import { describe, it, expect } from "vitest";
import { calcDraftOrder, type ParticipantStanding } from "./draft-order";

const P1 = "participant-1";
const P2 = "participant-2";
const P3 = "participant-3";
const P4 = "participant-4";

// ── Game 1: random shuffle ────────────────────────────────────────

describe("calcDraftOrder — Game 1 (no standings)", () => {
  it("returns all participants exactly once (valid permutation)", () => {
    const ids = [P1, P2, P3, P4];
    const result = calcDraftOrder(ids);

    expect(result).toHaveLength(ids.length);
    expect(new Set(result)).toEqual(new Set(ids));
  });

  it("returns all participants when standings is empty array", () => {
    const ids = [P1, P2, P3];
    const result = calcDraftOrder(ids, []);

    expect(result).toHaveLength(ids.length);
    expect(new Set(result)).toEqual(new Set(ids));
  });

  it("handles single participant", () => {
    const result = calcDraftOrder([P1]);
    expect(result).toEqual([P1]);
  });

  it("handles two participants", () => {
    const ids = [P1, P2];
    const result = calcDraftOrder(ids);

    expect(result).toHaveLength(2);
    expect(new Set(result)).toEqual(new Set(ids));
  });

  it("does not mutate the input array", () => {
    const ids = [P1, P2, P3];
    const original = [...ids];
    calcDraftOrder(ids);
    expect(ids).toEqual(original);
  });
});

// ── Game 2+: inverse standings ────────────────────────────────────

describe("calcDraftOrder — Game 2+ (standings provided)", () => {
  it("places lowest cumulative score first", () => {
    const standings: ParticipantStanding[] = [
      { participantId: P1, cumulativeFantasyPoints: 80, priorGamePickPosition: 1 },
      { participantId: P2, cumulativeFantasyPoints: 40, priorGamePickPosition: 2 },
      { participantId: P3, cumulativeFantasyPoints: 60, priorGamePickPosition: 3 },
    ];

    const result = calcDraftOrder([P1, P2, P3], standings);

    // P2 (40) picks first, P3 (60) second, P1 (80) last
    expect(result).toEqual([P2, P3, P1]);
  });

  it("tie-break: higher prior pick position picks first next game", () => {
    // P1 and P2 tied at 50; P1 had pick #3 (later), P2 had pick #1 (earlier)
    // P1 should pick first next game (higher prior pick number)
    const standings: ParticipantStanding[] = [
      { participantId: P1, cumulativeFantasyPoints: 50, priorGamePickPosition: 3 },
      { participantId: P2, cumulativeFantasyPoints: 50, priorGamePickPosition: 1 },
    ];

    const result = calcDraftOrder([P1, P2], standings);

    expect(result[0]).toBe(P1); // P1 had pick #3 → picks first next game
    expect(result[1]).toBe(P2);
  });

  it("three-way tie: all equal score, orders by prior pick position descending", () => {
    const standings: ParticipantStanding[] = [
      { participantId: P1, cumulativeFantasyPoints: 60, priorGamePickPosition: 1 },
      { participantId: P2, cumulativeFantasyPoints: 60, priorGamePickPosition: 3 },
      { participantId: P3, cumulativeFantasyPoints: 60, priorGamePickPosition: 2 },
    ];

    const result = calcDraftOrder([P1, P2, P3], standings);

    // P2 (prior #3) → P3 (prior #2) → P1 (prior #1)
    expect(result).toEqual([P2, P3, P1]);
  });

  it("mixed: lower score takes priority over tie-break", () => {
    const standings: ParticipantStanding[] = [
      { participantId: P1, cumulativeFantasyPoints: 100, priorGamePickPosition: 4 }, // worst score
      { participantId: P2, cumulativeFantasyPoints: 30, priorGamePickPosition: 1 },  // best score
      { participantId: P3, cumulativeFantasyPoints: 30, priorGamePickPosition: 2 },  // tied with P2
      { participantId: P4, cumulativeFantasyPoints: 70, priorGamePickPosition: 3 },
    ];

    const result = calcDraftOrder([P1, P2, P3, P4], standings);

    // P3 (30, prior#2) ties with P2 (30, prior#1) → P3 picks first (higher prior pick)
    // then P2, then P4 (70), then P1 (100)
    expect(result).toEqual([P3, P2, P4, P1]);
  });

  it("participant missing from standings defaults to 0 points and 0 prior position", () => {
    // P3 not in standings (e.g. late joiner edge case)
    const standings: ParticipantStanding[] = [
      { participantId: P1, cumulativeFantasyPoints: 50, priorGamePickPosition: 1 },
      { participantId: P2, cumulativeFantasyPoints: 70, priorGamePickPosition: 2 },
    ];

    const result = calcDraftOrder([P1, P2, P3], standings);

    // P3 defaults to 0 pts → picks first
    expect(result[0]).toBe(P3);
  });

  it("single participant with standings", () => {
    const standings: ParticipantStanding[] = [
      { participantId: P1, cumulativeFantasyPoints: 42, priorGamePickPosition: 1 },
    ];

    const result = calcDraftOrder([P1], standings);
    expect(result).toEqual([P1]);
  });

  it("does not mutate the input array", () => {
    const ids = [P1, P2, P3];
    const original = [...ids];
    const standings: ParticipantStanding[] = [
      { participantId: P1, cumulativeFantasyPoints: 10, priorGamePickPosition: 1 },
      { participantId: P2, cumulativeFantasyPoints: 20, priorGamePickPosition: 2 },
      { participantId: P3, cumulativeFantasyPoints: 30, priorGamePickPosition: 3 },
    ];
    calcDraftOrder(ids, standings);
    expect(ids).toEqual(original);
  });
});
