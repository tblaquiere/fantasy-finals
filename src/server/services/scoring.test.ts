import { describe, it, expect } from "vitest";
import { calculateFantasyPoints } from "./scoring";

describe("calculateFantasyPoints", () => {
  it("calculates correctly for a standard stat line", () => {
    // 17 PTS + (2×4 REB) + (2×6 AST) + (3×1 STL) + (3×0 BLK) = 17+8+12+3+0 = 40
    expect(
      calculateFantasyPoints({ pts: 17, reb: 4, ast: 6, stl: 1, blk: 0 }),
    ).toBe(40);
  });

  it("calculates correctly for a big stat line", () => {
    // 30 + (2×10) + (2×5) + (3×2) + (3×1) = 30+20+10+6+3 = 69
    expect(
      calculateFantasyPoints({ pts: 30, reb: 10, ast: 5, stl: 2, blk: 1 }),
    ).toBe(69);
  });

  it("returns 0 for all-zero stats", () => {
    expect(
      calculateFantasyPoints({ pts: 0, reb: 0, ast: 0, stl: 0, blk: 0 }),
    ).toBe(0);
  });

  it("handles steals-and-blocks-only stat line", () => {
    // 0 + 0 + 0 + (3×3) + (3×4) = 9 + 12 = 21
    expect(
      calculateFantasyPoints({ pts: 0, reb: 0, ast: 0, stl: 3, blk: 4 }),
    ).toBe(21);
  });

  it("handles points-only stat line", () => {
    expect(
      calculateFantasyPoints({ pts: 50, reb: 0, ast: 0, stl: 0, blk: 0 }),
    ).toBe(50);
  });

  it("returns integer result for all integer inputs", () => {
    const result = calculateFantasyPoints({
      pts: 25,
      reb: 7,
      ast: 3,
      stl: 1,
      blk: 2,
    });
    expect(Number.isInteger(result)).toBe(true);
    // 25 + 14 + 6 + 3 + 6 = 54
    expect(result).toBe(54);
  });
});
