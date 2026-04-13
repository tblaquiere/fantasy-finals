"use client";

import { useState } from "react";

import { api } from "~/trpc/react";
import { cn } from "~/lib/utils";

interface SeriesRosterProps {
  leagueId: string;
}

type SortKey = "name" | "totalFP" | "totalPoints" | "totalRebounds" | "totalAssists";

export function SeriesRoster({ leagueId }: SeriesRosterProps) {
  const [filter, setFilter] = useState<"all" | "mine" | "available">("all");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("totalFP");
  const [teamFilter, setTeamFilter] = useState<string | null>(null);

  const { data, isLoading } = api.standing.getSeriesRoster.useQuery({
    leagueId,
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-xl bg-zinc-900" />
        ))}
      </div>
    );
  }

  if (!data || data.players.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-zinc-500">
        No players found for this series.
      </p>
    );
  }

  let players = [...data.players];

  // Filter
  if (filter === "mine") {
    players = players.filter((p) => p.pickedByMe);
  } else if (filter === "available") {
    players = players.filter((p) => !p.pickedByMe);
  }

  if (teamFilter) {
    players = players.filter((p) => p.teamTricode === teamFilter);
  }

  if (search) {
    const q = search.toLowerCase();
    players = players.filter(
      (p) =>
        p.firstName.toLowerCase().includes(q) ||
        p.familyName.toLowerCase().includes(q) ||
        p.jersey.includes(q),
    );
  }

  // Sort
  players.sort((a, b) => {
    if (sortBy === "name") return a.familyName.localeCompare(b.familyName);
    return b[sortBy] - a[sortBy];
  });

  return (
    <div className="space-y-3">
      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search players..."
        className="w-full rounded-lg bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none focus:ring-1 focus:ring-orange-500"
      />

      {/* Filter tabs */}
      <div className="flex gap-1.5">
        {(["all", "mine", "available"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-medium",
              filter === f
                ? "bg-orange-500 text-zinc-950"
                : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800",
            )}
          >
            {f === "all" ? "All" : f === "mine" ? "My Picks" : "Available"}
          </button>
        ))}
        <span className="mx-1 border-l border-zinc-800" />
        {data.homeTricode && (
          <>
            <button
              type="button"
              onClick={() =>
                setTeamFilter(
                  teamFilter === data.homeTricode ? null : data.homeTricode,
                )
              }
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium",
                teamFilter === data.homeTricode
                  ? "bg-orange-500 text-zinc-950"
                  : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800",
              )}
            >
              {data.homeTricode}
            </button>
            <button
              type="button"
              onClick={() =>
                setTeamFilter(
                  teamFilter === data.awayTricode ? null : data.awayTricode,
                )
              }
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium",
                teamFilter === data.awayTricode
                  ? "bg-orange-500 text-zinc-950"
                  : "bg-zinc-900 text-zinc-400 hover:bg-zinc-800",
              )}
            >
              {data.awayTricode}
            </button>
          </>
        )}
      </div>

      {/* Sort bar */}
      <div className="flex items-center gap-2 text-[10px] text-zinc-500">
        <span>Sort:</span>
        {(
          [
            ["totalFP", "FP"],
            ["totalPoints", "PTS"],
            ["totalRebounds", "REB"],
            ["totalAssists", "AST"],
            ["name", "Name"],
          ] as [SortKey, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setSortBy(key)}
            className={cn(
              "rounded px-1.5 py-0.5",
              sortBy === key
                ? "bg-zinc-800 font-semibold text-orange-400"
                : "hover:text-zinc-300",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Player list */}
      <ul className="space-y-1">
        {players.map((player) => (
          <li
            key={player.nbaPlayerId}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5",
              player.pickedByMe
                ? "bg-orange-500/10 ring-1 ring-orange-500/30"
                : "bg-zinc-900",
            )}
          >
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-zinc-800 text-xs font-bold text-zinc-400">
              {player.jersey || "—"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span
                  className={cn(
                    "truncate text-sm font-medium",
                    player.pickedByMe ? "text-orange-400" : "text-zinc-100",
                  )}
                >
                  {player.firstName.charAt(0)}. {player.familyName}
                </span>
                <span className="text-[10px] text-zinc-500">
                  {player.teamTricode} &middot; {player.position || "—"}
                </span>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-zinc-500">
                {player.gamesPlayed > 0 && (
                  <>
                    <span>{player.totalFP} FP</span>
                    <span>{player.totalPoints} PTS</span>
                    <span>{player.totalRebounds} REB</span>
                    <span>{player.totalAssists} AST</span>
                  </>
                )}
                {player.pickedByMe && player.myPickGames.length > 0 && (
                  <span className="text-orange-400">
                    Picked G{player.myPickGames.join(", G")}
                  </span>
                )}
                {player.timesPicked > 0 && !player.pickedByMe && (
                  <span>
                    Picked {player.timesPicked}x
                  </span>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>

      {players.length === 0 && (
        <p className="py-8 text-center text-sm text-zinc-500">
          No players match your filters.
        </p>
      )}
    </div>
  );
}
