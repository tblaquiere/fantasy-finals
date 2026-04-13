"use client";

import { api } from "~/trpc/react";

interface GameBreakdownProps {
  leagueId: string;
  gameId: string;
}

export function GameBreakdown({ leagueId, gameId }: GameBreakdownProps) {
  const { data, isLoading } = api.standing.getGameBreakdown.useQuery({
    leagueId,
    gameId,
  });

  if (isLoading) {
    return (
      <div className="space-y-2 p-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-12 animate-pulse rounded-lg bg-zinc-800" />
        ))}
      </div>
    );
  }

  if (!data || data.stats.length === 0) {
    return (
      <p className="p-3 text-center text-xs text-zinc-600">No picks yet</p>
    );
  }

  const categories = [
    { key: "points", label: "PTS" },
    { key: "rebounds", label: "REB" },
    { key: "assists", label: "AST" },
    { key: "steals", label: "STL" },
    { key: "blocks", label: "BLK" },
    { key: "fantasyPoints", label: "FP" },
  ] as const;

  return (
    <div className="overflow-x-auto rounded-xl bg-zinc-900/50 p-3">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-zinc-500">
            <th className="pb-2 text-left font-medium">Player</th>
            {categories.map((c) => (
              <th key={c.key} className="pb-2 text-right font-medium">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.stats.map((s) => (
            <tr key={s.participantId} className="border-t border-zinc-800/50">
              <td className="py-2 pr-2">
                <p
                  className={`font-medium ${
                    s.isMe ? "text-orange-400" : "text-zinc-200"
                  }`}
                >
                  {s.participantName}
                </p>
                <p className="text-[10px] text-zinc-600">
                  {s.playerName}{" "}
                  <span className="text-zinc-700">{s.playerTeam}</span>
                  {s.isMozgov && (
                    <span className="ml-1 text-red-500">(Mozgov)</span>
                  )}
                </p>
              </td>
              {categories.map((c) => {
                const isLeader =
                  data.leaders[c.key]?.includes(s.participantId) ?? false;
                return (
                  <td
                    key={c.key}
                    className={`py-2 text-right tabular-nums ${
                      isLeader
                        ? "font-bold text-orange-500"
                        : "text-zinc-300"
                    }`}
                  >
                    {s[c.key]}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
