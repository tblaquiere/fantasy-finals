/**
 * Schedule-derived playoff series catalog.
 *
 * Replaces the hand-maintained SERIES_STUBS const. The NBA static schedule
 * lists every playoff series the moment matchups are decided (the next
 * round's games appear within hours of the prior round's deciding game),
 * which gives the league-creation dropdown the auto-population behavior
 * users expect.
 *
 * Lookup tolerance: getPlayoffSeries() also falls back to the NbaSeries
 * table so legacy seriesId strings stored on existing League rows continue
 * to resolve even though the canonical schedule-derived ids use a
 * different naming convention.
 */

import type { PrismaClient } from "../../../generated/prisma/index.js";
import { nbaStatsService, type PlayoffScheduleGame } from "./nba-stats";

export interface PlayoffSeries {
  id: string;
  name: string;
  homeTeamId: number;
  homeTricode: string;
  homeTeamName: string;
  awayTeamId: number;
  awayTricode: string;
  awayTeamName: string;
  round: number;
  seasonYear: string;
}

// NBA team-id → conference. Used to derive the e/w prefix on series ids
// and to label series names. Stable league data, safe to hardcode.
const EAST_TEAM_IDS = new Set<number>([
  1610612737, // ATL
  1610612738, // BOS
  1610612751, // BKN
  1610612766, // CHA
  1610612741, // CHI
  1610612739, // CLE
  1610612765, // DET
  1610612754, // IND
  1610612748, // MIA
  1610612749, // MIL
  1610612752, // NYK
  1610612753, // ORL
  1610612755, // PHI
  1610612761, // TOR
  1610612764, // WAS
]);

function conferenceOf(teamId: number): "east" | "west" {
  return EAST_TEAM_IDS.has(teamId) ? "east" : "west";
}

function roundLabel(round: number): string {
  if (round === 1) return "Round 1";
  if (round === 2) return "Conference Semifinals";
  if (round === 3) return "Conference Finals";
  if (round === 4) return "NBA Finals";
  return `Round ${round}`;
}

// NBA playoff gameIds encode round in the 8th digit (0-indexed: position 7):
//   0042500{ROUND}{SERIES}{GAME}
// where ROUND is 1=R1, 2=R2, 3=Conference Finals, 4=NBA Finals.
function roundFromGameId(gameId: string): number | null {
  const ch = gameId.charAt(7);
  const r = parseInt(ch, 10);
  return Number.isFinite(r) && r >= 1 && r <= 4 ? r : null;
}

function seasonStartYear(seasonYear: string): number {
  // "2025-26" → 2025
  const head = seasonYear.split("-")[0];
  return parseInt(head ?? "0", 10);
}

function deriveSeriesId(opts: {
  seasonYear: string;
  round: number;
  awayTricode: string;
  homeTricode: string;
  // conference is needed for R1-R3; R4 (Finals) is inter-conference.
  conference: "east" | "west" | null;
}): string {
  const playoffYear = seasonStartYear(opts.seasonYear) + 1; // 2025-26 → 2026
  const a = opts.awayTricode.toLowerCase();
  const h = opts.homeTricode.toLowerCase();
  if (opts.round === 4) {
    return `${playoffYear}-nbafinals-${a}-${h}`;
  }
  const conf = opts.conference === "east" ? "e" : "w";
  return `${playoffYear}-${conf}r${opts.round}-${a}-${h}`;
}

function deriveSeriesName(opts: {
  round: number;
  conference: "east" | "west" | null;
  awayTeamName: string;
  homeTeamName: string;
}): string {
  const conf =
    opts.round === 4
      ? ""
      : opts.conference === "east"
        ? "East "
        : "West ";
  return `${opts.awayTeamName} vs ${opts.homeTeamName} — ${conf}${roundLabel(opts.round)}`;
}

/**
 * Group playoff games from the schedule into series. A "series" is a set
 * of games that share a (round, team-pair). Returns one PlayoffSeries per
 * matchup the schedule knows about — past, present, and future.
 */
function groupGamesIntoSeries(
  games: PlayoffScheduleGame[],
  seasonYear: string,
): PlayoffSeries[] {
  const byKey = new Map<string, PlayoffScheduleGame>();
  for (const g of games) {
    const round = roundFromGameId(g.gameId);
    if (round === null) continue;
    const pair = [g.homeTeamId, g.awayTeamId].sort((x, y) => x - y).join("-");
    const key = `${round}|${pair}`;
    // Keep the earliest scheduled game so home/away matches G1 (higher seed = home G1).
    const prev = byKey.get(key);
    if (!prev || g.gameDateUTC.getTime() < prev.gameDateUTC.getTime()) {
      byKey.set(key, g);
    }
  }

  const series: PlayoffSeries[] = [];
  for (const [key, g1] of byKey) {
    const round = parseInt(key.split("|")[0]!, 10);
    const conference =
      round === 4 ? null : conferenceOf(g1.homeTeamId);
    series.push({
      id: deriveSeriesId({
        seasonYear,
        round,
        awayTricode: g1.awayTricode,
        homeTricode: g1.homeTricode,
        conference,
      }),
      name: deriveSeriesName({
        round,
        conference,
        awayTeamName: g1.awayTeamName,
        homeTeamName: g1.homeTeamName,
      }),
      homeTeamId: g1.homeTeamId,
      homeTricode: g1.homeTricode,
      homeTeamName: g1.homeTeamName,
      awayTeamId: g1.awayTeamId,
      awayTricode: g1.awayTricode,
      awayTeamName: g1.awayTeamName,
      round,
      seasonYear,
    });
  }
  // Most recent rounds first (CF before R1).
  series.sort((a, b) => b.round - a.round);
  return series;
}

// Small in-process cache on top of the schedule's own 1h cache. Avoids
// re-grouping ~150 playoff games on every dropdown render.
const SERIES_CACHE_TTL_MS = 5 * 60 * 1000;
let seriesCache: { data: PlayoffSeries[]; fetchedAt: number } | null = null;

/** Return all playoff series the NBA schedule knows about. */
export async function listAvailablePlayoffSeries(): Promise<PlayoffSeries[]> {
  if (seriesCache && Date.now() - seriesCache.fetchedAt < SERIES_CACHE_TTL_MS) {
    return seriesCache.data;
  }
  const [games, seasonYear] = await Promise.all([
    nbaStatsService.getPlayoffGames(),
    nbaStatsService.getSeasonYear(),
  ]);
  const data = groupGamesIntoSeries(games, seasonYear ?? "");
  seriesCache = { data, fetchedAt: Date.now() };
  return data;
}

/**
 * Look up a single series by id. Prefers the NbaSeries DB row (covers
 * any series already populated, including legacy seriesIds on existing
 * League rows) and falls back to the schedule-derived catalog for
 * upcoming series that haven't been populated yet. DB-first avoids the
 * ~8MB schedule fetch on the worker's hot path.
 */
export async function getPlayoffSeries(
  db: PrismaClient,
  seriesId: string,
): Promise<PlayoffSeries | null> {
  const row = await db.nbaSeries.findUnique({ where: { seriesId } });
  if (row) {
    const conference =
      row.round === 4 ? null : conferenceOf(row.homeTeamId);
    return {
      id: row.seriesId,
      name: deriveSeriesName({
        round: row.round,
        conference,
        awayTeamName: row.awayTeamName,
        homeTeamName: row.homeTeamName,
      }),
      homeTeamId: row.homeTeamId,
      homeTricode: row.homeTricode,
      homeTeamName: row.homeTeamName,
      awayTeamId: row.awayTeamId,
      awayTricode: row.awayTricode,
      awayTeamName: row.awayTeamName,
      round: row.round,
      seasonYear: row.seasonYear,
    };
  }

  const list = await listAvailablePlayoffSeries();
  return list.find((s) => s.id === seriesId) ?? null;
}
