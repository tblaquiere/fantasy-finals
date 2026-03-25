"use client";

import { api } from "~/trpc/react";
import { ScoreBadge } from "./ScoreBadge";
import { LIVE_SCORE_POLL_INTERVAL_MS } from "~/lib/constants";

interface LiveScoreBoardProps {
  gameId: string;
}

export function LiveScoreBoard({ gameId }: LiveScoreBoardProps) {
  const { data, isLoading } = api.game.getLiveScores.useQuery(
    { gameId },
    {
      refetchInterval: (query) => {
        const d = query.state.data;
        if (!d) return LIVE_SCORE_POLL_INTERVAL_MS;
        if (d.isFinal || d.status === "final") return false;
        return LIVE_SCORE_POLL_INTERVAL_MS;
      },
      refetchIntervalInBackground: false,
    },
  );

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-16 animate-pulse rounded-xl bg-zinc-900"
          />
        ))}
      </div>
    );
  }

  if (!data) {
    return (
      <p className="py-8 text-center text-sm text-zinc-500">
        Game not found
      </p>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-300">
          Game {data.gameNumber}
        </h2>
        <ScoreBadge
          period={data.period}
          isFinal={data.isFinal}
          status={data.status}
        />
      </div>

      {data.picks.length === 0 ? (
        <p className="py-8 text-center text-sm text-zinc-500">
          No picks confirmed yet
        </p>
      ) : (
        <ul className="space-y-2">
          {data.picks.map((pick, idx) => (
            <li
              key={pick.id}
              className="flex items-center gap-3 rounded-xl bg-zinc-900 px-4 py-3"
            >
              <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-zinc-800 text-xs font-bold text-zinc-400">
                {idx + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-zinc-100">
                  {pick.participantName}
                </p>
                <p className="text-xs text-zinc-500">
                  {pick.playerFirstName.charAt(0)}.{" "}
                  {pick.playerFamilyName}
                  <span className="ml-1 text-zinc-600">
                    {pick.playerTeamTricode}
                  </span>
                </p>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold tabular-nums text-orange-500">
                  {pick.fantasyPoints}
                </p>
                <p className="text-[10px] text-zinc-600 tabular-nums">
                  {pick.points}p {pick.rebounds}r {pick.assists}a{" "}
                  {pick.steals}s {pick.blocks}b
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
