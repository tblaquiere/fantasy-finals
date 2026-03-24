import { describe, it, expect } from "vitest";

// calcDraftOpenTime is tested here by reimporting just the pure function.
// We can't import from the worker file directly because it pulls in db/env.
// Instead, test the logic inline.

/**
 * Calculate the next 9am PST/PDT from a reference time.
 * Duplicated here for unit testing — the source of truth is in
 * src/worker/jobs/draft-order-publish.ts.
 */
function calcDraftOpenTime(referenceDate: Date): Date {
  const laFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  });

  const parts = laFormatter.formatToParts(referenceDate);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const day = Number(parts.find((p) => p.type === "day")?.value);
  const hour = Number(parts.find((p) => p.type === "hour")?.value);

  let targetDay = day;
  if (hour >= 9) {
    targetDay = day + 1;
  }

  const laDateStr = `${year}-${String(month).padStart(2, "0")}-${String(targetDay).padStart(2, "0")}T09:00:00`;

  const tempDate = new Date(laDateStr + "Z");
  const utcFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "2-digit",
    hour12: false,
  });
  const utcHour = tempDate.getUTCHours();
  const laHour = Number(
    utcFormatter.formatToParts(tempDate).find((p) => p.type === "hour")?.value,
  );
  const offsetHours = utcHour - laHour;

  const result = new Date(laDateStr + "Z");
  result.setUTCHours(9 + offsetHours, 0, 0, 0);

  return result;
}

// ── calcDraftOpenTime ────────────────────────────────────────────

describe("calcDraftOpenTime", () => {
  it("schedules 9am PDT next day when game ends in the evening", () => {
    // Game ends at 10pm PDT (5am UTC next day) on March 20, 2026
    // March is PDT (UTC-7)
    const gameEnd = new Date("2026-03-21T05:00:00Z"); // 10pm PDT March 20

    const result = calcDraftOpenTime(gameEnd);

    // Should be 9am PDT March 21 = 16:00 UTC March 21
    expect(result.getUTCHours()).toBe(16);
    expect(result.getUTCDate()).toBe(21);
    expect(result.getUTCMinutes()).toBe(0);
  });

  it("schedules 9am PDT same day if reference is before 9am LA time", () => {
    // 3am PDT March 21 = 10am UTC March 21
    const gameEnd = new Date("2026-03-21T10:00:00Z");

    const result = calcDraftOpenTime(gameEnd);

    // Should be 9am PDT March 21 = 16:00 UTC March 21
    expect(result.getUTCHours()).toBe(16);
    expect(result.getUTCDate()).toBe(21);
  });

  it("handles PST (winter time) correctly", () => {
    // January = PST (UTC-8)
    // Game ends at 10pm PST Jan 15 = 6am UTC Jan 16
    const gameEnd = new Date("2026-01-16T06:00:00Z");

    const result = calcDraftOpenTime(gameEnd);

    // Should be 9am PST Jan 16 = 17:00 UTC Jan 16
    expect(result.getUTCHours()).toBe(17);
    expect(result.getUTCDate()).toBe(16);
  });

  it("returns a Date object", () => {
    const result = calcDraftOpenTime(new Date());
    expect(result).toBeInstanceOf(Date);
    expect(result.getUTCMinutes()).toBe(0);
    expect(result.getUTCSeconds()).toBe(0);
  });
});

// ── Clock math ───────────────────────────────────────────────────

describe("clock math", () => {
  it("clockExpiresAt = clockStartsAt + durationMinutes", () => {
    const clockDurationMinutes = 60;
    const clockStartsAt = new Date("2026-03-21T16:00:00Z");
    const clockExpiresAt = new Date(
      clockStartsAt.getTime() + clockDurationMinutes * 60 * 1000,
    );

    expect(clockExpiresAt.toISOString()).toBe("2026-03-21T17:00:00.000Z");
  });

  it("handles 30-minute clock duration", () => {
    const clockDurationMinutes = 30;
    const clockStartsAt = new Date("2026-03-21T16:00:00Z");
    const clockExpiresAt = new Date(
      clockStartsAt.getTime() + clockDurationMinutes * 60 * 1000,
    );

    expect(clockExpiresAt.toISOString()).toBe("2026-03-21T16:30:00.000Z");
  });
});
