// App-wide constants — populate per story
// See architecture.md for constants referenced across the codebase

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
