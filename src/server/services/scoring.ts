/**
 * Fantasy Scoring Engine — Story 3.1
 *
 * Pure function: no DB calls, no external calls.
 * Formula: 1×PTS + 2×REB + 2×AST + 3×STL + 3×BLK
 */

export interface PlayerStatLine {
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
}

/**
 * Calculate fantasy points from a player's stat line.
 * Returns an integer (the formula always produces whole numbers from whole-number inputs).
 */
export function calculateFantasyPoints(stats: PlayerStatLine): number {
  return (
    1 * stats.pts +
    2 * stats.reb +
    2 * stats.ast +
    3 * stats.stl +
    3 * stats.blk
  );
}
