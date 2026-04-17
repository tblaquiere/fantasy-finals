// App-wide constants — populate per story
// See architecture.md for constants referenced across the codebase

// Series list with NBA team metadata for auto-populating DB records
export const SERIES_STUBS = [
  {
    id: "2026-ec1-raptors-cavaliers",
    name: "Raptors vs Cavaliers — East R1",
    homeTeamId: 1610612761, homeTricode: "TOR", homeTeamName: "Toronto Raptors",
    awayTeamId: 1610612739, awayTricode: "CLE", awayTeamName: "Cleveland Cavaliers",
    round: 1, seasonYear: "2025-26",
  },
  {
    id: "2026-wc1-timberwolves-nuggets",
    name: "Timberwolves vs Nuggets — West R1",
    homeTeamId: 1610612750, homeTricode: "MIN", homeTeamName: "Minnesota Timberwolves",
    awayTeamId: 1610612743, awayTricode: "DEN", awayTeamName: "Denver Nuggets",
    round: 1, seasonYear: "2025-26",
  },
  {
    id: "2026-ec2-hawks-knicks",
    name: "Hawks vs Knicks — East R1",
    homeTeamId: 1610612737, homeTricode: "ATL", homeTeamName: "Atlanta Hawks",
    awayTeamId: 1610612752, awayTricode: "NYK", awayTeamName: "New York Knicks",
    round: 1, seasonYear: "2025-26",
  },
  {
    id: "2026-wc2-rockets-lakers",
    name: "Rockets vs Lakers — West R1",
    homeTeamId: 1610612745, homeTricode: "HOU", homeTeamName: "Houston Rockets",
    awayTeamId: 1610612747, awayTricode: "LAL", awayTeamName: "Los Angeles Lakers",
    round: 1, seasonYear: "2025-26",
  },
] as const;

export type SeriesId = (typeof SERIES_STUBS)[number]["id"];

// NBA API base URLs — Story 3.1
// Primary: cdn.nba.com live endpoints (no IP blocking, works from cloud/Railway)
// stats.nba.com is blocked from cloud IPs via Akamai bot protection
export const NBA_LIVE_BASE_URL = "https://cdn.nba.com/static/json/liveData";
export const NBA_MIN_REQUEST_INTERVAL_MS = 3000; // 3s minimum between requests
export const NBA_REQUEST_TIMEOUT_MS = 10000; // 10s timeout per request

// Clock duration options (minutes) — up to MAX_CLOCK_MINUTES
export const CLOCK_DURATION_OPTIONS = [15, 30, 45, 60] as const;
export type ClockDurationMinutes = (typeof CLOCK_DURATION_OPTIONS)[number];

// Mozgov Rule threshold: players with fewer than this many first-half minutes trigger the rule
export const MOZGOV_THRESHOLD_MINUTES = 5;

// Maximum selection clock duration (minutes) per pick
export const MAX_CLOCK_MINUTES = 60;

// Mozgov replacement window duration (minutes) per triggered participant
export const MOZGOV_CLOCK_MINUTES = 3;

// Pick reminder notification fires when this many minutes remain on the clock
export const PICK_REMINDER_MINUTES = 10;

// Draft feed polling interval (ms) — target: pick visible within 3s of submission
export const DRAFT_FEED_POLL_INTERVAL_MS = 3000;

// Live score polling interval (ms) — target: update within 60s of official NBA stat publication
export const LIVE_SCORE_POLL_INTERVAL_MS = 30000;

// Mozgov window polling interval (ms) — tight polling while replacement window is open
export const MOZGOV_POLL_INTERVAL_MS = 5000;
