import { describe, it, expect } from "vitest";
import {
  minLegalOffsetMinutes,
  validateOffset,
  effectiveOffset,
} from "./draft-open-schedule";

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
