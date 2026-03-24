/**
 * Draft Order Service — Stories 3.3, 3.4
 *
 * calcDraftOrder: Pure function for ordering (no DB calls).
 * generateAndPersistDraftOrder: DB transaction for creating Game + DraftSlots.
 *
 * Game 1: random (Fisher-Yates shuffle)
 * Game 2+: inverse cumulative fantasy score; tie-break by prior pick position (descending)
 * (FR9)
 */

import type { PrismaClient, Prisma } from "generated/prisma";

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
 * Create a Game record with DraftSlots in a single transaction.
 * Shared by the tRPC commissioner procedure and the draft.order-publish job handler.
 *
 * Returns the created game's id and gameNumber.
 */
export async function generateAndPersistDraftOrder(
  db: PrismaClient,
  leagueId: string,
  nbaGameId: string,
): Promise<{ gameId: string; gameNumber: number }> {
  const participants = await db.participant.findMany({
    where: { leagueId },
    orderBy: { joinedAt: "asc" },
  });

  if (participants.length === 0) {
    throw new Error("League has no participants");
  }

  const participantIds = participants.map((p) => p.id);

  const game = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    // Idempotency guard
    const existing = await tx.game.findUnique({
      where: { leagueId_nbaGameId: { leagueId, nbaGameId } },
    });
    if (existing) {
      return existing;
    }

    const existingGameCount = await tx.game.count({ where: { leagueId } });
    const gameNumber = existingGameCount + 1;

    // Build standings for Game 2+
    let standings: ParticipantStanding[] | undefined;
    if (gameNumber > 1) {
      const priorGame = await tx.game.findFirst({
        where: { leagueId },
        orderBy: { gameNumber: "desc" },
        include: { draftSlots: true },
      });

      standings = participants.map((p) => {
        const slot = priorGame?.draftSlots.find(
          (ds) => ds.participantId === p.id,
        );
        return {
          participantId: p.id,
          cumulativeFantasyPoints: 0, // populated when Pick model exists (Story 3.6)
          priorGamePickPosition: slot?.pickPosition ?? null,
        };
      });
    }

    const orderedIds = calcDraftOrder(participantIds, standings);

    const created = await tx.game.create({
      data: { leagueId, nbaGameId, gameNumber },
    });

    await tx.draftSlot.createMany({
      data: orderedIds.map((participantId, idx) => ({
        gameId: created.id,
        participantId,
        pickPosition: idx + 1,
      })),
    });

    return created;
  });

  return { gameId: game.id, gameNumber: game.gameNumber };
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
