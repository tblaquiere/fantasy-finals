"use client";

import { useState } from "react";

import { api } from "~/trpc/react";
import { ScoreBadge } from "~/components/game/ScoreBadge";
import { LIVE_SCORE_POLL_INTERVAL_MS } from "~/lib/constants";
import { GameBreakdown } from "./GameBreakdown";

interface SeriesLeaderboardProps {
  leagueId: string;
}

export function SeriesLeaderboard({ leagueId }: SeriesLeaderboardProps) {
  const [expandedGameId, setExpandedGameId] = useState<string | null>(null);

  const { data: categoryLeaders } = api.standing.getCategoryLeaders.useQuery(
    { leagueId },
  );

  const { data, isLoading } = api.standing.getLeaderboard.useQuery(
    { leagueId },
    {
      refetchInterval: (query) => {
        const d = query.state.data;
        if (!d) return LIVE_SCORE_POLL_INTERVAL_MS;
        return d.hasLiveGame ? LIVE_SCORE_POLL_INTERVAL_MS : false;
      },
      refetchIntervalInBackground: false,
    },
  );

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl bg-zinc-900" />
        ))}
      </div>
    );
  }

  if (!data || data.standings.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-zinc-500">
        No games played yet
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {/* Leaderboard */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-zinc-300">
          Series Standings
        </h2>
        <ul className="space-y-1.5">
          {data.standings.map((s, idx) => (
            <li
              key={s.participantId}
              className="flex items-center gap-3 rounded-xl bg-zinc-900 px-4 py-3"
            >
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-zinc-800 text-xs font-bold text-zinc-400">
                {idx + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p
                  className={`text-sm font-medium ${
                    s.isMe ? "text-orange-400" : "text-zinc-100"
                  }`}
                >
                  {s.participantName}
                  {s.isMe && " (You)"}
                </p>
                <p className="text-[10px] text-zinc-600 tabular-nums">
                  {s.gameResults
                    .map(
                      (g) =>
                        `G${g.gameNumber}: ${g.fantasyPoints}${g.isMozgov ? "*" : ""}`,
                    )
                    .join(" | ")}
                </p>
              </div>
              <span className="text-lg font-bold tabular-nums text-orange-500">
                {s.totalFantasyPoints}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* Category Leaders */}
      {categoryLeaders && categoryLeaders.leaders.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-zinc-300">
            Category Leaders
          </h2>
          <div className="grid grid-cols-3 gap-1.5">
            {categoryLeaders.leaders.map((l) => (
              <div
                key={l.category}
                className="rounded-xl bg-zinc-900 px-3 py-2.5 text-center"
              >
                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  {l.label}
                </p>
                <p className="mt-0.5 text-lg font-bold tabular-nums text-orange-500">
                  {l.value}
                </p>
                <p
                  className={`mt-0.5 truncate text-[11px] ${
                    l.isMe ? "font-medium text-orange-400" : "text-zinc-400"
                  }`}
                >
                  {l.participantName}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Per-game results */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-zinc-300">Games</h2>
        <ul className="space-y-1.5">
          {data.games.map((game) => (
            <li key={game.id}>
              <button
                type="button"
                onClick={() =>
                  setExpandedGameId(
                    expandedGameId === game.id ? null : game.id,
                  )
                }
                className="flex w-full items-center justify-between rounded-xl bg-zinc-900 px-4 py-3 text-left hover:bg-zinc-800"
              >
                <span className="text-sm font-medium text-zinc-100">
                  Game {game.gameNumber}
                </span>
                <ScoreBadge
                  period={game.period}
                  isFinal={game.isFinal}
                  status={game.status}
                />
              </button>
              {expandedGameId === game.id && (
                <div className="mt-1">
                  <GameBreakdown leagueId={leagueId} gameId={game.id} />
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
