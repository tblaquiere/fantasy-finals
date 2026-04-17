/**
 * Populate NbaSeries + NbaPlayer records from NBA API or SERIES_STUBS metadata.
 * Called during league creation when the series doesn't exist in the DB yet.
 */

import type { PrismaClient } from "../../../generated/prisma/index.js";
import { SERIES_STUBS } from "~/lib/constants";
import { nbaStatsService } from "./nba-stats";

export async function ensureSeriesPopulated(
  db: PrismaClient,
  seriesId: string,
): Promise<void> {
  // Already populated?
  const existing = await db.nbaSeries.findUnique({
    where: { seriesId },
  });
  if (existing) {
    // Check if players exist for this series
    const playerCount = await db.nbaPlayer.count({
      where: {
        teamId: { in: [existing.homeTeamId, existing.awayTeamId] },
      },
    });
    if (playerCount > 0) return; // fully populated
  }

  const stub = SERIES_STUBS.find((s) => s.id === seriesId);
  if (!stub) {
    console.error(`[populate-series] Unknown series ID: ${seriesId}`);
    return;
  }

  // Create NbaSeries record if needed
  if (!existing) {
    await db.nbaSeries.create({
      data: {
        seriesId: stub.id,
        homeTeamId: stub.homeTeamId,
        awayTeamId: stub.awayTeamId,
        homeTeamName: stub.homeTeamName,
        awayTeamName: stub.awayTeamName,
        homeTricode: stub.homeTricode,
        awayTricode: stub.awayTricode,
        seasonYear: stub.seasonYear,
        round: stub.round,
        status: "scheduled",
      },
    });
    console.log(`[populate-series] Created NbaSeries: ${stub.name}`);
  }

  // Try fetching rosters from NBA API
  const season = stub.seasonYear; // e.g. "2025-26"
  const [homeRoster, awayRoster] = await Promise.all([
    nbaStatsService.getTeamRoster(stub.homeTeamId, stub.homeTricode, season),
    nbaStatsService.getTeamRoster(stub.awayTeamId, stub.awayTricode, season),
  ]);

  const allPlayers = [
    ...(homeRoster ?? []),
    ...(awayRoster ?? []),
  ];

  if (allPlayers.length === 0) {
    console.warn(
      `[populate-series] NBA API returned no players for ${stub.name}. ` +
      `Rosters will populate from the first boxscore once games start.`
    );
    return;
  }

  // Upsert players
  let created = 0;
  for (const p of allPlayers) {
    if (!p.personId) continue;
    await db.nbaPlayer.upsert({
      where: { nbaPlayerId: p.personId },
      update: {
        teamId: p.teamId,
        teamTricode: p.teamTricode,
        position: p.position,
        jersey: p.jersey,
      },
      create: {
        nbaPlayerId: p.personId,
        firstName: p.firstName,
        familyName: p.familyName,
        teamId: p.teamId,
        teamTricode: p.teamTricode,
        position: p.position,
        jersey: p.jersey,
      },
    });
    created++;
  }

  console.log(
    `[populate-series] Populated ${created} players for ${stub.name}`
  );
}
