import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from "vitest";
import { parseMinutes, nbaStatsService } from "./nba-stats";

describe("parseMinutes", () => {
  it("parses standard ISO 8601 duration", () => {
    expect(parseMinutes("PT25M01.00S")).toBe(25);
  });

  it("parses short duration", () => {
    expect(parseMinutes("PT04M30.00S")).toBe(4);
  });

  it("parses zero minutes", () => {
    expect(parseMinutes("PT00M00.00S")).toBe(0);
  });

  it("parses minutes-only format", () => {
    expect(parseMinutes("PT32M")).toBe(32);
  });

  it("returns 0 for null", () => {
    expect(parseMinutes(null)).toBe(0);
  });

  it("returns 0 for undefined", () => {
    expect(parseMinutes(undefined)).toBe(0);
  });

  it("returns 0 for empty string", () => {
    expect(parseMinutes("")).toBe(0);
  });

  it("returns 0 for invalid format", () => {
    expect(parseMinutes("invalid")).toBe(0);
  });
});

describe("nbaStatsService.getLiveBoxScore", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns parsed box score on success", async () => {
    const mockResponse = {
      game: {
        gameId: "0042400101",
        gameStatus: 2,
        gameStatusText: "Q2 5:30",
        period: 2,
        gameClock: "PT05M30.00S",
        homeTeam: {
          teamId: 1610612760,
          teamName: "Thunder",
          teamTricode: "OKC",
          score: 55,
          players: [
            {
              personId: 1629029,
              firstName: "Shai",
              familyName: "Gilgeous-Alexander",
              jerseyNum: "2",
              position: "G",
              teamId: 1610612760,
              teamTricode: "OKC",
              played: "1",
              statistics: {
                minutes: "PT22M15.00S",
                minutesCalculated: "PT22M",
                points: 18,
                reboundsTotal: 3,
                assists: 5,
                steals: 2,
                blocks: 0,
              },
            },
          ],
        },
        awayTeam: {
          teamId: 1610612763,
          teamName: "Grizzlies",
          teamTricode: "MEM",
          score: 48,
          players: [],
        },
      },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const result = await nbaStatsService.getLiveBoxScore("0042400101");

    expect(result).not.toBeNull();
    expect(result!.gameId).toBe("0042400101");
    expect(result!.gameStatus).toBe(2);
    expect(result!.period).toBe(2);
    expect(result!.homeTeam.teamTricode).toBe("OKC");
    expect(result!.homeTeam.score).toBe(55);
    expect(result!.homeTeam.players).toHaveLength(1);

    const sga = result!.homeTeam.players[0]!;
    expect(sga.personId).toBe(1629029);
    expect(sga.firstName).toBe("Shai");
    expect(sga.minutes).toBe(22);
    expect(sga.points).toBe(18);
    expect(sga.reboundsTotal).toBe(3);
    expect(sga.assists).toBe(5);
    expect(sga.steals).toBe(2);
    expect(sga.blocks).toBe(0);
    expect(sga.status).toBe("ACTIVE");
  });

  it("returns null on HTTP error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: "Not Found",
    });

    const result = await nbaStatsService.getLiveBoxScore("invalid");
    expect(result).toBeNull();
  });

  it("returns null on network error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const result = await nbaStatsService.getLiveBoxScore("0042400101");
    expect(result).toBeNull();
  });

  it("returns null when game data is missing", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    });

    const result = await nbaStatsService.getLiveBoxScore("0042400101");
    expect(result).toBeNull();
  });
});

describe("nbaStatsService.getTodaysScoreboard", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns parsed scoreboard on success", async () => {
    const mockResponse = {
      scoreboard: {
        gameDate: "2026-04-15",
        games: [
          {
            gameId: "0042400101",
            gameStatus: 1,
            gameStatusText: "7:00 pm ET",
            period: 0,
            gameClock: "",
            gameTimeUTC: "2026-04-16T00:00:00Z",
            homeTeam: {
              teamId: 1610612760,
              teamName: "Thunder",
              teamTricode: "OKC",
              score: 0,
            },
            awayTeam: {
              teamId: 1610612763,
              teamName: "Grizzlies",
              teamTricode: "MEM",
              score: 0,
            },
          },
        ],
      },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const result = await nbaStatsService.getTodaysScoreboard();

    expect(result).not.toBeNull();
    expect(result!.gameDate).toBe("2026-04-15");
    expect(result!.games).toHaveLength(1);
    expect(result!.games[0]!.gameId).toBe("0042400101");
    expect(result!.games[0]!.homeTeam.teamTricode).toBe("OKC");
  });

  it("returns null on error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("timeout"));

    const result = await nbaStatsService.getTodaysScoreboard();
    expect(result).toBeNull();
  });
});

// Rate limiter test runs last to avoid polluting lastRequestTime module state
// with fake-timer values that would cause timeouts in other tests.
describe("rate limiter", () => {
  let rateMockFetch: MockInstance;

  beforeEach(() => {
    rateMockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ game: null }),
    });
    vi.stubGlobal("fetch", rateMockFetch);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("fires both requests when second call respects 3s interval", async () => {
    // Fake clock starts at current real time; advance to clear any prior rate limit
    vi.advanceTimersByTime(5000);

    const p1 = nbaStatsService.getLiveBoxScore("0042400101");
    const p2 = nbaStatsService.getLiveBoxScore("0042400102");

    // Drain all timers so both requests (including the 3s wait) can complete
    await vi.runAllTimersAsync();
    await Promise.all([p1, p2]);

    expect(rateMockFetch).toHaveBeenCalledTimes(2);
    expect(rateMockFetch.mock.calls[0]![0]).toContain("boxscore_0042400101");
    expect(rateMockFetch.mock.calls[1]![0]).toContain("boxscore_0042400102");
  });
});
