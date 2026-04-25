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
import { SERIES_STUBS } from "~/lib/constants";
import { nbaStatsService } from "~/server/services/nba-stats";

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
  options: { provisional?: boolean } = {},
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
      // Get the most recent prior game (draft order based on last game only)
      const mostRecentGame = await tx.game.findFirst({
        where: { leagueId },
        orderBy: { gameNumber: "desc" },
        include: { draftSlots: true },
      });

      if (!mostRecentGame) {
        // No prior games — random order
        standings = undefined;
      } else {
        // Get confirmed picks from the most recent game only
        const lastGamePicks = await tx.pick.findMany({
          where: {
            leagueId,
            confirmed: true,
            gameId: mostRecentGame.id,
          },
          include: {
            game: { select: { nbaGameId: true } },
          },
        });

        // Look up box scores for each pick's player
        const boxScores = await tx.boxScore.findMany({
          where: {
            nbaGameId: mostRecentGame.nbaGameId,
            nbaPlayerId: { in: lastGamePicks.map((p) => p.nbaPlayerId) },
          },
        });

        // Map: nbaPlayerId → fantasyPoints
        const bsMap = new Map(
          boxScores.map((bs) => [
            bs.nbaPlayerId,
            bs.correctedFantasyPoints ?? bs.fantasyPoints,
          ]),
        );

        standings = participants.map((p) => {
          const pick = lastGamePicks.find(
            (pk) => pk.participantId === p.id,
          );
          const cumulativeFantasyPoints = pick
            ? (bsMap.get(pick.nbaPlayerId) ?? 0)
            : 0;

          const slot = mostRecentGame.draftSlots.find(
            (ds) => ds.participantId === p.id,
          );
          return {
            participantId: p.id,
            cumulativeFantasyPoints,
            priorGamePickPosition: slot?.pickPosition ?? null,
          };
        });
      }
    }

    const orderedIds = calcDraftOrder(participantIds, standings);

    const created = await tx.game.create({
      data: {
        leagueId,
        nbaGameId,
        gameNumber,
        draftOrderProvisional: options.provisional ?? false,
      },
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
 * Story 7.3: Auto-generate the next game's draft order as **provisional** immediately
 * after the prior game finalizes. Resolves the next NBA game ID by consulting the
 * static league schedule for the next game between the same two teams. If no future
 * game is found (e.g. series is over), returns { resolved: false }.
 *
 * Idempotent on two axes:
 *   - If a Game already exists at the next sequential gameNumber, returns it.
 *   - generateAndPersistDraftOrder additionally guards on the unique (league, nbaGame).
 */
export async function autoGenerateProvisionalNext(
  db: PrismaClient,
  leagueId: string,
  justFinalizedGameId: string,
): Promise<
  | { gameId: string; gameNumber: number; created: boolean; resolved: true }
  | { resolved: false; reason: string }
> {
  const existingCount = await db.game.count({ where: { leagueId } });
  const nextGameNumber = existingCount + 1;

  // Already have a Game at this slot — preserve commissioner-created order.
  const existingNext = await db.game.findFirst({
    where: { leagueId, gameNumber: nextGameNumber },
  });
  if (existingNext) {
    return {
      gameId: existingNext.id,
      gameNumber: existingNext.gameNumber,
      created: false,
      resolved: true,
    };
  }

  // Resolve the next NBA game ID from the static league schedule.
  const justFinalized = await db.game.findUnique({
    where: { id: justFinalizedGameId },
    include: { league: { select: { seriesId: true } } },
  });
  if (!justFinalized) {
    return { resolved: false, reason: "just-finalized game not found" };
  }
  const stub = SERIES_STUBS.find((s) => s.id === justFinalized.league.seriesId);
  if (!stub) {
    return { resolved: false, reason: `unknown series ${justFinalized.league.seriesId}` };
  }

  // Anchor to the just-finalized NBA game's start date when known via NbaGame,
  // otherwise the Game record's createdAt is a reasonable lower bound.
  const nbaGame = await db.nbaGame.findUnique({
    where: { nbaGameId: justFinalized.nbaGameId },
    select: { gameDate: true },
  });
  const afterUTC = nbaGame?.gameDate ?? justFinalized.createdAt;

  const next = await nbaStatsService.getNextSeriesGame(
    stub.homeTeamId,
    stub.awayTeamId,
    afterUTC,
  );
  if (!next) {
    return { resolved: false, reason: "no future series game on schedule" };
  }

  // Defensive: if someone (commissioner, prior auto-gen) already has a Game with
  // this exact nbaGameId, return that instead of creating a duplicate.
  const existingByNbaGameId = await db.game.findUnique({
    where: { leagueId_nbaGameId: { leagueId, nbaGameId: next.nbaGameId } },
  });
  if (existingByNbaGameId) {
    return {
      gameId: existingByNbaGameId.id,
      gameNumber: existingByNbaGameId.gameNumber,
      created: false,
      resolved: true,
    };
  }

  const result = await generateAndPersistDraftOrder(
    db,
    leagueId,
    next.nbaGameId,
    { provisional: true },
  );
  return { ...result, created: true, resolved: true };
}

/**
 * Story 7.4: Recompute the next game's provisional draft order after a stat correction.
 * Returns participantIds whose pick positions changed (so the caller can dispatch
 * notifications), or an empty array when the order is unchanged or the regeneration
 * is not allowed (draft window already opened, slots locked, no provisional order).
 */
export async function regenerateProvisionalIfChanged(
  db: PrismaClient,
  leagueId: string,
): Promise<{ gameId: string; changedParticipantIds: string[] } | null> {
  const nextGame = await db.game.findFirst({
    where: { leagueId, draftOrderProvisional: true, status: "pending" },
    orderBy: { gameNumber: "asc" },
    include: { draftSlots: { orderBy: { pickPosition: "asc" } } },
  });

  if (!nextGame || nextGame.draftSlots.length === 0) {
    return null;
  }

  const participants = await db.participant.findMany({
    where: { leagueId },
    orderBy: { joinedAt: "asc" },
  });
  if (participants.length === 0) return null;

  // Recompute standings using the same logic as generateAndPersistDraftOrder, but
  // independently here so we can compare against the existing slots without writing.
  const priorGame = await db.game.findFirst({
    where: { leagueId, gameNumber: nextGame.gameNumber - 1 },
    include: { draftSlots: true },
  });

  let standings: ParticipantStanding[] | undefined;
  if (priorGame) {
    const priorPicks = await db.pick.findMany({
      where: { leagueId, gameId: priorGame.id, confirmed: true },
    });
    const boxScores = await db.boxScore.findMany({
      where: {
        nbaGameId: priorGame.nbaGameId,
        nbaPlayerId: { in: priorPicks.map((p) => p.nbaPlayerId) },
      },
    });
    const bsMap = new Map(
      boxScores.map((bs) => [
        bs.nbaPlayerId,
        bs.correctedFantasyPoints ?? bs.fantasyPoints,
      ]),
    );
    standings = participants.map((p) => {
      const pick = priorPicks.find((pk) => pk.participantId === p.id);
      const slot = priorGame.draftSlots.find((ds) => ds.participantId === p.id);
      return {
        participantId: p.id,
        cumulativeFantasyPoints: pick ? (bsMap.get(pick.nbaPlayerId) ?? 0) : 0,
        priorGamePickPosition: slot?.pickPosition ?? null,
      };
    });
  }

  const newOrder = calcDraftOrder(
    participants.map((p) => p.id),
    standings,
  );

  const oldPositionByPid = new Map(
    nextGame.draftSlots.map((s) => [s.participantId, s.pickPosition]),
  );

  const changedParticipantIds: string[] = [];
  for (let i = 0; i < newOrder.length; i++) {
    const pid = newOrder[i]!;
    const newPos = i + 1;
    if (oldPositionByPid.get(pid) !== newPos) {
      changedParticipantIds.push(pid);
    }
  }

  if (changedParticipantIds.length === 0) {
    return { gameId: nextGame.id, changedParticipantIds: [] };
  }

  // Apply the new order. Unique constraints make us delete-then-insert.
  await db.$transaction(async (tx) => {
    await tx.draftSlot.deleteMany({ where: { gameId: nextGame.id } });
    await tx.draftSlot.createMany({
      data: newOrder.map((participantId, idx) => ({
        gameId: nextGame.id,
        participantId,
        pickPosition: idx + 1,
      })),
    });
  });

  return { gameId: nextGame.id, changedParticipantIds };
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
