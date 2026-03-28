/**
 * Player Eligibility Service — Story 3.1
 *
 * Enforces player eligibility rules for draft picks and Mozgov replacements.
 * Pure functions — callers supply pre-fetched ID sets from the database.
 */

import { MOZGOV_THRESHOLD_MINUTES } from "~/lib/constants";
import { type NbaPlayerStats } from "./nba-stats";

/**
 * Check if a player is active for a game (not DNP/injured).
 * A player is considered active if they have a non-zero minutes entry or are
 * listed as played in the box score data.
 */
export function isPlayerActive(playerStats: NbaPlayerStats): boolean {
  return playerStats.status === "ACTIVE";
}

/**
 * Check if a player qualifies for the Mozgov Rule trigger.
 * Returns true if the player is active but played fewer than MOZGOV_THRESHOLD_MINUTES
 * at halftime (i.e., they sat the first half despite being on the active roster).
 * DNP/injured players do NOT trigger Mozgov — only active players who failed
 * to reach the minutes threshold.
 */
export function isMozgovTriggered(playerStats: NbaPlayerStats): boolean {
  if (!isPlayerActive(playerStats)) return false;
  return playerStats.minutes < MOZGOV_THRESHOLD_MINUTES;
}

/**
 * Check if a player is eligible for a standard draft pick.
 * Rules (FR8):
 *   (a) active for tonight's game
 *   (b) not previously used by this participant in the current series
 *   (c) not already picked by anyone in this game (double-draft prevention)
 *
 * @param playerStats - Live stats from nba-stats service (for active check)
 * @param usedPlayerIds - Set of nbaPlayerIds this participant has used in the series
 * @param pickedPlayerIds - Set of nbaPlayerIds already picked by anyone in this game
 */
export function isPlayerEligibleForDraft(
  playerStats: NbaPlayerStats,
  usedPlayerIds: Set<number>,
  pickedPlayerIds: Set<number>,
): boolean {
  // (a) Must be active for tonight's game
  if (!isPlayerActive(playerStats)) return false;
  // (b) Not previously used by this participant in the series
  if (usedPlayerIds.has(playerStats.personId)) return false;
  // (c) Not already picked by anyone in this game
  if (pickedPlayerIds.has(playerStats.personId)) return false;
  return true;
}

/**
 * Check if a player is eligible as a Mozgov replacement.
 * Rules (FR24):
 *   (a) active for tonight's game
 *   (b) played 5+ minutes in the most recent game in which they were active
 *   (c) not already used by this participant in the current series
 *
 * @param playerStats - Live stats from nba-stats service (for active check)
 * @param usedPlayerIds - Set of nbaPlayerIds this participant has used in the series
 * @param mostRecentActiveMinutes - Minutes played in their most recent active game (null if no prior games)
 */
export function isPlayerEligibleForMozgov(
  playerStats: NbaPlayerStats,
  usedPlayerIds: Set<number>,
  mostRecentActiveMinutes: number | null,
): boolean {
  // (a) Must be active for tonight's game
  if (!isPlayerActive(playerStats)) return false;
  // (b) Must have played 5+ minutes in most recent active game
  if (
    mostRecentActiveMinutes === null ||
    mostRecentActiveMinutes < MOZGOV_THRESHOLD_MINUTES
  ) {
    return false;
  }
  // (c) Not already used by this participant in the series
  if (usedPlayerIds.has(playerStats.personId)) return false;
  return true;
}
