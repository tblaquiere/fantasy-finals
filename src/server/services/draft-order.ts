/**
 * Draft Order Service — Story 3.3
 *
 * Pure function: no DB calls, no external calls.
 * Generates the sequential pick order for a league game.
 *
 * Game 1: random (Fisher-Yates shuffle)
 * Game 2+: inverse cumulative fantasy score; tie-break by prior pick position (descending)
 * (FR9)
 */

export interface ParticipantStanding {
  participantId: string;
  cumulativeFantasyPoints: number; // sum across all prior games in the series
  priorGamePickPosition: number | null; // pickPosition from most recent game; null for Game 1
}

/**
 * Calculate draft pick order for a league game.
 *
 * @param participantIds - All participant IDs in the league (any order)
 * @param standings      - Cumulative standings from prior games.
 *                         Omit (or pass undefined) for Game 1 → produces a random shuffle.
 * @returns participantIds in pick order; index 0 is pick #1 (picks first)
 */
export function calcDraftOrder(
  participantIds: string[],
  standings?: ParticipantStanding[],
): string[] {
  if (!standings || standings.length === 0) {
    return fisherYatesShuffle([...participantIds]);
  }

  // Build a lookup for O(1) access
  const standingMap = new Map<string, ParticipantStanding>(
    standings.map((s) => [s.participantId, s]),
  );

  // Sort ascending by cumulative score; ties broken by prior pick position descending
  // (higher prior pick number → earlier next pick, per FR9 tie-break rule)
  const sorted = [...participantIds].sort((a, b) => {
    const aStanding = standingMap.get(a);
    const bStanding = standingMap.get(b);

    const aPoints = aStanding?.cumulativeFantasyPoints ?? 0;
    const bPoints = bStanding?.cumulativeFantasyPoints ?? 0;

    if (aPoints !== bPoints) {
      return aPoints - bPoints; // lower score picks first (inverse standings)
    }

    // Tie-break: higher prior pick position picks first next game
    const aPrior = aStanding?.priorGamePickPosition ?? 0;
    const bPrior = bStanding?.priorGamePickPosition ?? 0;
    return bPrior - aPrior; // descending
  });

  return sorted;
}

/**
 * Fisher-Yates in-place shuffle. Mutates and returns the array.
 * Uses Math.random() — sufficient for MVP draft ordering.
 */
function fisherYatesShuffle(arr: string[]): string[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr;
}
