/**
 * NBA Stats API Service — Story 3.1
 *
 * Sole NBA data contact point. All NBA data enters the system through this module.
 * Provider swap requires changes to this file ONLY.
 *
 * Primary: cdn.nba.com live endpoints (no IP blocking, works from cloud)
 * Fallback upgrade: BallDontLie paid API (if reliability insufficient)
 */

import {
  NBA_LIVE_BASE_URL,
  NBA_MIN_REQUEST_INTERVAL_MS,
  NBA_REQUEST_TIMEOUT_MS,
} from "~/lib/constants";

// ── Public Types ─────────────────────────────────────────────────

export interface NbaPlayerStats {
  personId: number;
  firstName: string;
  familyName: string;
  jerseyNum: string;
  position: string;
  teamId: number;
  teamTricode: string;
  minutes: number; // parsed from ISO 8601 duration
  points: number;
  reboundsTotal: number;
  assists: number;
  steals: number;
  blocks: number;
  status: "ACTIVE" | "INACTIVE"; // derived from oncourt/minutes presence
}

export interface NbaBoxScoreResponse {
  gameId: string;
  gameStatus: number; // 1=scheduled, 2=in-progress, 3=final
  gameStatusText: string;
  period: number;
  gameClock: string;
  homeTeam: NbaTeamBoxScore;
  awayTeam: NbaTeamBoxScore;
}

export interface NbaTeamBoxScore {
  teamId: number;
  teamName: string;
  teamTricode: string;
  score: number;
  players: NbaPlayerStats[];
}

export interface NbaScoreboardGame {
  gameId: string;
  gameStatus: number;
  gameStatusText: string;
  period: number;
  gameClock: string;
  gameTimeUTC: string;
  homeTeam: {
    teamId: number;
    teamName: string;
    teamTricode: string;
    score: number;
  };
  awayTeam: {
    teamId: number;
    teamName: string;
    teamTricode: string;
    score: number;
  };
}

export interface NbaScoreboardResponse {
  gameDate: string;
  games: NbaScoreboardGame[];
}

// ── Raw API Response Types (cdn.nba.com shape) ───────────────────

interface RawPlayerStatistics {
  minutes?: string;
  minutesCalculated?: string;
  points?: number;
  reboundsTotal?: number;
  assists?: number;
  steals?: number;
  blocks?: number;
}

interface RawPlayer {
  personId?: number;
  firstName?: string;
  familyName?: string;
  jerseyNum?: string;
  position?: string;
  teamId?: number;
  teamTricode?: string;
  played?: string;
  statistics?: RawPlayerStatistics;
}

interface RawTeam {
  teamId?: number;
  teamName?: string;
  teamTricode?: string;
  score?: number;
  players?: RawPlayer[];
}

interface RawGame {
  gameId?: string;
  gameStatus?: number;
  gameStatusText?: string;
  period?: number;
  gameClock?: string;
  homeTeam?: RawTeam;
  awayTeam?: RawTeam;
}

interface RawBoxScoreEnvelope {
  game?: RawGame;
}

interface RawScoreboardGame {
  gameId?: string;
  gameStatus?: number;
  gameStatusText?: string;
  period?: number;
  gameClock?: string;
  gameTimeUTC?: string;
  homeTeam?: {
    teamId?: number;
    teamName?: string;
    teamTricode?: string;
    score?: number;
  };
  awayTeam?: {
    teamId?: number;
    teamName?: string;
    teamTricode?: string;
    score?: number;
  };
}

interface RawScoreboardEnvelope {
  scoreboard?: {
    gameDate?: string;
    games?: RawScoreboardGame[];
  };
}

// ── Rate Limiting ────────────────────────────────────────────────

// NOTE: Module-level state is not safe under concurrent requests but is
// acceptable for MVP single-worker polling. Revisit if parallelism is needed.
let lastRequestTime = 0;

async function rateLimitedFetch(url: string): Promise<Response> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < NBA_MIN_REQUEST_INTERVAL_MS) {
    await new Promise((resolve) =>
      setTimeout(resolve, NBA_MIN_REQUEST_INTERVAL_MS - elapsed),
    );
  }
  lastRequestTime = Date.now();

  return fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; FantasyFinals/1.0)",
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(NBA_REQUEST_TIMEOUT_MS),
  });
}

// ── Helpers ──────────────────────────────────────────────────────

/**
 * Parse ISO 8601 duration (PT25M01.00S) to integer minutes.
 * Returns 0 for empty/invalid strings.
 */
export function parseMinutes(iso8601: string | undefined | null): number {
  if (!iso8601) return 0;
  const match = /PT(\d+)M/.exec(iso8601);
  return match?.[1] ? parseInt(match[1], 10) : 0;
}

function mapPlayerStats(raw: RawPlayer): NbaPlayerStats {
  const minutesStr =
    raw.statistics?.minutesCalculated ?? raw.statistics?.minutes;

  return {
    personId: raw.personId ?? 0,
    firstName: raw.firstName ?? "",
    familyName: raw.familyName ?? "",
    jerseyNum: raw.jerseyNum ?? "",
    position: raw.position ?? "",
    teamId: raw.teamId ?? 0,
    teamTricode: raw.teamTricode ?? "",
    minutes: parseMinutes(minutesStr),
    points: raw.statistics?.points ?? 0,
    reboundsTotal: raw.statistics?.reboundsTotal ?? 0,
    assists: raw.statistics?.assists ?? 0,
    steals: raw.statistics?.steals ?? 0,
    blocks: raw.statistics?.blocks ?? 0,
    status:
      raw.played === "1" || parseMinutes(minutesStr) > 0
        ? "ACTIVE"
        : "INACTIVE",
  };
}

function mapTeam(raw: RawTeam | undefined): NbaTeamBoxScore {
  return {
    teamId: raw?.teamId ?? 0,
    teamName: raw?.teamName ?? "",
    teamTricode: raw?.teamTricode ?? "",
    score: raw?.score ?? 0,
    players: (raw?.players ?? []).map(mapPlayerStats),
  };
}

// ── Roster Types ────────────────────────────────────────────────

export interface NbaRosterPlayer {
  personId: number;
  firstName: string;
  familyName: string;
  jersey: string;
  position: string;
  teamId: number;
  teamTricode: string;
}

interface RawRosterPlayer {
  PLAYER_ID?: number;
  PLAYER?: string;
  NUM?: string;
  POSITION?: string;
  TeamID?: number;
}

interface RawCommonTeamRoster {
  resultSets?: Array<{
    name?: string;
    rowSet?: Array<unknown[]>;
    headers?: string[];
  }>;
}

// ── Service ──────────────────────────────────────────────────────

export const nbaStatsService = {
  /**
   * Fetch live box score for a specific game.
   * Returns null on error (callers should use last-known data).
   */
  async getLiveBoxScore(
    nbaGameId: string,
  ): Promise<NbaBoxScoreResponse | null> {
    try {
      const url = `${NBA_LIVE_BASE_URL}/boxscore/boxscore_${nbaGameId}.json`;
      const res = await rateLimitedFetch(url);

      if (!res.ok) {
        console.error(
          `[nba-stats] getLiveBoxScore failed: ${res.status} ${res.statusText}`,
        );
        return null;
      }

      const data = (await res.json()) as RawBoxScoreEnvelope;
      const game = data.game;
      if (!game) return null;

      return {
        gameId: game.gameId ?? "",
        gameStatus: game.gameStatus ?? 0,
        gameStatusText: game.gameStatusText ?? "",
        period: game.period ?? 0,
        gameClock: game.gameClock ?? "",
        homeTeam: mapTeam(game.homeTeam),
        awayTeam: mapTeam(game.awayTeam),
      };
    } catch (error) {
      console.error("[nba-stats] getLiveBoxScore error:", error);
      return null;
    }
  },

  /**
   * Fetch today's NBA scoreboard (all games for today).
   * Returns null on error.
   */
  async getTodaysScoreboard(): Promise<NbaScoreboardResponse | null> {
    try {
      const url = `${NBA_LIVE_BASE_URL}/scoreboard/todaysScoreboard_00.json`;
      const res = await rateLimitedFetch(url);

      if (!res.ok) {
        console.error(
          `[nba-stats] getTodaysScoreboard failed: ${res.status} ${res.statusText}`,
        );
        return null;
      }

      const data = (await res.json()) as RawScoreboardEnvelope;
      const scoreboard = data.scoreboard;
      if (!scoreboard) return null;

      return {
        gameDate: scoreboard.gameDate ?? "",
        games: (scoreboard.games ?? []).map(
          (g): NbaScoreboardGame => ({
            gameId: g.gameId ?? "",
            gameStatus: g.gameStatus ?? 0,
            gameStatusText: g.gameStatusText ?? "",
            period: g.period ?? 0,
            gameClock: g.gameClock ?? "",
            gameTimeUTC: g.gameTimeUTC ?? "",
            homeTeam: {
              teamId: g.homeTeam?.teamId ?? 0,
              teamName: g.homeTeam?.teamName ?? "",
              teamTricode: g.homeTeam?.teamTricode ?? "",
              score: g.homeTeam?.score ?? 0,
            },
            awayTeam: {
              teamId: g.awayTeam?.teamId ?? 0,
              teamName: g.awayTeam?.teamName ?? "",
              teamTricode: g.awayTeam?.teamTricode ?? "",
              score: g.awayTeam?.score ?? 0,
            },
          }),
        ),
      };
    } catch (error) {
      console.error("[nba-stats] getTodaysScoreboard error:", error);
      return null;
    }
  },

  /**
   * Fetch team roster from stats.nba.com CommonTeamRoster endpoint.
   * Returns null on error.
   */
  async getTeamRoster(
    teamId: number,
    teamTricode: string,
    season: string,
  ): Promise<NbaRosterPlayer[] | null> {
    try {
      const url = `https://stats.nba.com/stats/commonteamroster?TeamID=${teamId}&Season=${season}`;
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Referer: "https://www.nba.com/",
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) {
        console.error(`[nba-stats] getTeamRoster failed for ${teamTricode}: ${res.status}`);
        return null;
      }

      const data = (await res.json()) as RawCommonTeamRoster;
      const rosterSet = data.resultSets?.find((rs) => rs.name === "CommonTeamRoster");
      if (!rosterSet?.headers || !rosterSet?.rowSet) return null;

      const h = rosterSet.headers;
      const pidIdx = h.indexOf("PLAYER_ID");
      const nameIdx = h.indexOf("PLAYER");
      const numIdx = h.indexOf("NUM");
      const posIdx = h.indexOf("POSITION");

      return rosterSet.rowSet.map((row): NbaRosterPlayer => {
        const fullName = (row[nameIdx] as string) ?? "";
        const parts = fullName.split(" ");
        const firstName = parts[0] ?? "";
        const familyName = parts.slice(1).join(" ") || "";
        return {
          personId: (row[pidIdx] as number) ?? 0,
          firstName,
          familyName,
          jersey: row[numIdx] != null ? `${row[numIdx] as string | number}` : "",
          position: (row[posIdx] as string) ?? "",
          teamId,
          teamTricode,
        };
      });
    } catch (error) {
      console.error(`[nba-stats] getTeamRoster error for ${teamTricode}:`, error);
      return null;
    }
  },
};
