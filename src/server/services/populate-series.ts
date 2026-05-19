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

  // NOTE: previous versions of this function (commit 9a3864b, 2026-05-19)
  // retired any NbaPlayer tagged with a team's teamId but absent from the
  // current box score, moving them to teamId=0 / tricode=LEGACY-*. That was
  // unsafe: legitimate roster members DNP all the time, and the single box
  // score we scrape is not authoritative for full team membership. The
  // logic mass-retired most of the Knicks bench (Brunson, Bridges, Hart,
  // KAT, etc.) and Grizzlies bench (Bane, JJJ, Smart, etc.) on 2026-05-19
  // during routine league creation, breaking participant preference lists.
  //
  // If duplicate "seed-fake" rows reappear later (e.g. wrong personIds
  // attached to real player names on the same team), add a narrow dedup
  // step keyed on (teamId + firstName + familyName) — NOT the broad
  // "absent from box score" heuristic.

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
