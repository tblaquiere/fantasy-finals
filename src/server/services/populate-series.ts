/**
 * Populate NbaSeries + NbaPlayer records from NBA API.
 * Called during league creation when the series doesn't exist in the DB yet.
 */

import type { PrismaClient } from "../../../generated/prisma/index.js";
import { nbaStatsService } from "./nba-stats";
import { getPlayoffSeries } from "./playoff-series";

export async function ensureSeriesPopulated(
  db: PrismaClient,
  seriesId: string,
): Promise<void> {
  // Always re-fetch on call. The previous "if any players exist, skip"
  // shortcut was unsafe: stale partial rows from a seed/test league could
  // satisfy the check and prevent the real playoff roster from ever being
  // populated (incident: WCF Thunder roster missing SGA and 8 others
  // because 6 stale seed rows from 2026-03-30 looked "populated enough").
  // This function only runs on league creation, so re-fetching is cheap.
  const existing = await db.nbaSeries.findUnique({
    where: { seriesId },
  });

  const stub = await getPlayoffSeries(db, seriesId);
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

  // Fetch rosters via the CDN box score endpoint (the stats.nba.com roster
  // endpoint has been observed returning contaminated cross-team data from
  // cloud IPs — see Story 7-fix-roster).
  const [homeRoster, awayRoster] = await Promise.all([
    nbaStatsService.getTeamRosterFromCdn(stub.homeTeamId, stub.homeTricode),
    nbaStatsService.getTeamRosterFromCdn(stub.awayTeamId, stub.awayTricode),
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

  // Retire stale rows: anything currently tagged with this team's teamId
  // but absent from the live box-score roster. Set teamId=0 / tricode=LEGACY-*
  // so the row no longer surfaces in the draft picker (which queries by
  // teamId) but FK references from older Pick / PreferenceListItem /
  // BoxScore rows still resolve.
  const realIds = new Set<number>(
    allPlayers.map((p) => p.personId).filter(Boolean),
  );
  for (const teamId of [stub.homeTeamId, stub.awayTeamId]) {
    const tricode =
      teamId === stub.homeTeamId ? stub.homeTricode : stub.awayTricode;
    const stale = await db.nbaPlayer.findMany({
      where: { teamId, nbaPlayerId: { notIn: [...realIds] } },
      select: { nbaPlayerId: true, firstName: true, familyName: true },
    });
    for (const s of stale) {
      console.warn(
        `[populate-series] retiring stale ${tricode} row: ${s.nbaPlayerId} ${s.firstName} ${s.familyName}`,
      );
      await db.nbaPlayer.update({
        where: { nbaPlayerId: s.nbaPlayerId },
        data: { teamId: 0, teamTricode: `LEGACY-${tricode}` },
      });
    }
  }

  // Upsert real players
  let created = 0;
  for (const p of allPlayers) {
    if (!p.personId) continue;
    await db.nbaPlayer.upsert({
      where: { nbaPlayerId: p.personId },
      update: {
        firstName: p.firstName,
        familyName: p.familyName,
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
