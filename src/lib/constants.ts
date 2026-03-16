// App-wide constants — populate per story
// See architecture.md for constants referenced across the codebase

// Stubbed series list — real NBA API integration in Story 3.1
export const SERIES_STUBS = [
  { id: "2025-wc1-okc-memphis", name: "OKC Thunder vs Memphis Grizzlies — West R1" },
  { id: "2025-wc2-lakers-warriors", name: "Lakers vs Warriors — West R1" },
  { id: "2025-ec1-celtics-heat", name: "Celtics vs Heat — East R1" },
  { id: "2025-ec2-knicks-sixers", name: "Knicks vs 76ers — East R1" },
] as const;

export type SeriesId = (typeof SERIES_STUBS)[number]["id"];

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
