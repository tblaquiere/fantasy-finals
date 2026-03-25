"use client";

import { useState, useRef, useCallback } from "react";
import { toast } from "sonner";
import { cn } from "~/lib/utils";
import { api } from "~/trpc/react";

interface PlayerStats {
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  fantasyPoints: number;
}

interface Player {
  nbaPlayerId: number;
  firstName: string;
  familyName: string;
  teamTricode: string;
  teamName: string;
  homeAway: "home" | "away";
  position: string;
  jerseyNum: string;
  eligible: boolean;
  isUsed: boolean;
  isPicked: boolean;
  isActive: boolean;
  seriesAvg: number;
  gamesPlayed: number;
  lastGame: PlayerStats | null;
  liveStats: PlayerStats;
}

interface PlayerListProps {
  players: Player[];
  gameId: string;
  leagueId: string;
}

type PickState =
  | { phase: "browsing" }
  | { phase: "confirming"; player: Player }
  | { phase: "submitted"; player: Player; pickId: string }
  | { phase: "done"; player: Player };

const SCORING_MULTIPLIERS = {
  pts: { label: "PTS", mult: 1 },
  reb: { label: "REB", mult: 2 },
  ast: { label: "AST", mult: 2 },
  stl: { label: "STL", mult: 3 },
  blk: { label: "BLK", mult: 3 },
} as const;

function StatBreakdown({ stats, label }: { stats: PlayerStats; label: string }) {
  return (
    <div className="mt-2">
      <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
        {label}
      </p>
      <div className="grid grid-cols-5 gap-1 text-center text-xs">
        {(Object.keys(SCORING_MULTIPLIERS) as (keyof typeof SCORING_MULTIPLIERS)[]).map(
          (key) => {
            const { label: statLabel, mult } = SCORING_MULTIPLIERS[key];
            const value = stats[key];
            const fp = value * mult;
            return (
              <div key={key} className="rounded bg-zinc-800 px-1 py-1">
                <div className="text-zinc-400">
                  {statLabel} <span className="text-zinc-600">x{mult}</span>
                </div>
                <div className="font-medium text-zinc-200">{value}</div>
                <div className="text-[10px] text-orange-400">{fp} fp</div>
              </div>
            );
          },
        )}
      </div>
    </div>
  );
}

export function PlayerList({ players, gameId, leagueId }: PlayerListProps) {
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [pickState, setPickState] = useState<PickState>({ phase: "browsing" });
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const submitPick = api.draft.submitPick.useMutation();
  const undoPick = api.draft.undoPick.useMutation();
  const confirmPick = api.draft.confirmPick.useMutation();

  const handleConfirmPick = useCallback(
    async (player: Player) => {
      try {
        const result = await submitPick.mutateAsync({
          leagueId,
          gameId,
          nbaPlayerId: player.nbaPlayerId,
        });

        setPickState({ phase: "submitted", player, pickId: result.pickId });

        // Start 5-second auto-confirm timer
        confirmTimerRef.current = setTimeout(() => {
          confirmPick
            .mutateAsync({ pickId: result.pickId })
            .then(() => setPickState({ phase: "done", player }))
            .catch(console.error);
        }, 5000);

        // Show undo toast
        toast("Your pick is in", {
          description: `${player.firstName} ${player.familyName} — ${player.teamTricode}`,
          duration: 5000,
          action: {
            label: "Undo",
            onClick: () => {
              if (confirmTimerRef.current) {
                clearTimeout(confirmTimerRef.current);
                confirmTimerRef.current = null;
              }
              undoPick
                .mutateAsync({ pickId: result.pickId })
                .then(() => {
                  setPickState({ phase: "browsing" });
                  setSelectedId(null);
                  toast.success("Pick undone — select a new player");
                })
                .catch((err: unknown) => {
                  const message =
                    err instanceof Error ? err.message : "Could not undo pick";
                  toast.error(message);
                });
            },
          },
        });
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Failed to submit pick";
        if (message.includes("already picked")) {
          toast.error("Player already picked by another participant");
        } else {
          toast.error(message);
        }
        setPickState({ phase: "browsing" });
      }
    },
    [leagueId, gameId, submitPick, undoPick, confirmPick],
  );

  // Success state
  if (pickState.phase === "submitted" || pickState.phase === "done") {
    const { player } = pickState;
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-green-800 bg-green-950/50 px-4 py-4 text-center">
          <p className="text-lg font-bold text-green-400">Your pick is in</p>
          <p className="mt-1 text-zinc-300">
            {player.firstName} {player.familyName}
          </p>
          <p className="text-sm text-zinc-500">{player.teamTricode}</p>
        </div>
        {pickState.phase === "done" && (
          <p className="text-center text-xs text-zinc-500">
            Pick locked. Good luck!
          </p>
        )}
      </div>
    );
  }

  // Confirmation dialog
  if (pickState.phase === "confirming") {
    const { player } = pickState;
    return (
      <div className="space-y-4">
        <div className="rounded-xl bg-zinc-900 px-4 py-6 text-center">
          <p className="mb-1 text-sm text-zinc-400">Confirm your pick</p>
          <p className="text-xl font-bold text-zinc-100">
            {player.firstName} {player.familyName}
          </p>
          <p className="text-sm text-zinc-400">{player.teamTricode} — {player.position}</p>
          <div className="mt-4 flex gap-3 justify-center">
            <button
              type="button"
              onClick={() => setPickState({ phase: "browsing" })}
              className="min-h-[44px] rounded-lg bg-zinc-800 px-6 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-700"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={submitPick.isPending}
              onClick={() => void handleConfirmPick(player)}
              className="min-h-[44px] rounded-lg bg-orange-500 px-6 py-2 text-sm font-bold text-zinc-950 hover:bg-orange-400 disabled:opacity-50"
            >
              {submitPick.isPending ? "Submitting..." : "Confirm"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Browsing state — player list
  return (
    <div className="space-y-3">
      {selectedId && (
        <button
          type="button"
          onClick={() => {
            const player = players.find((p) => p.nbaPlayerId === selectedId);
            if (player?.eligible) {
              setPickState({ phase: "confirming", player });
            }
          }}
          className="w-full min-h-[44px] rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-bold text-zinc-950 hover:bg-orange-400"
        >
          Confirm Pick
        </button>
      )}

      <ul className="space-y-1">
        {players.map((player) => {
          const isExpanded = expandedId === player.nbaPlayerId;
          const isSelected = selectedId === player.nbaPlayerId;

          return (
            <li key={player.nbaPlayerId}>
              <button
                type="button"
                disabled={!player.eligible}
                onClick={() => {
                  if (!player.eligible) return;
                  setExpandedId(isExpanded ? null : player.nbaPlayerId);
                  setSelectedId(player.nbaPlayerId);
                }}
                className={cn(
                  "flex w-full items-center rounded-xl bg-zinc-900 px-3 transition-colors",
                  "min-h-[72px] text-left",
                  player.eligible
                    ? "hover:bg-zinc-800"
                    : "cursor-not-allowed opacity-50",
                  isSelected && player.eligible && "border-l-4 border-orange-500",
                )}
              >
                <div className="flex flex-1 items-center gap-3">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-zinc-800 text-xs font-bold text-zinc-400">
                    {player.jerseyNum}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium text-zinc-100">
                        {player.firstName.charAt(0)}. {player.familyName}
                      </span>
                      {player.isUsed && (
                        <span className="flex-shrink-0 rounded bg-zinc-700 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">
                          USED
                        </span>
                      )}
                      {player.isPicked && (
                        <span className="flex-shrink-0 rounded bg-red-900/50 px-1.5 py-0.5 text-[10px] font-medium text-red-400">
                          TAKEN
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-zinc-500">
                      <span>{player.teamTricode}</span>
                      <span className="text-zinc-700">&middot;</span>
                      <span>{player.position}</span>
                      <span className="text-zinc-700">&middot;</span>
                      <span className={player.homeAway === "home" ? "text-zinc-400" : ""}>
                        {player.homeAway === "home" ? "HOME" : "AWAY"}
                      </span>
                    </div>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <div className="text-sm font-bold text-orange-400">
                      {player.seriesAvg.toFixed(1)}
                    </div>
                    <div className="text-[10px] text-zinc-500">series avg</div>
                  </div>
                </div>
              </button>

              {isExpanded && player.eligible && (
                <div className="mx-3 rounded-b-xl bg-zinc-900/80 px-3 pb-3 pt-1">
                  <StatBreakdown stats={player.liveStats} label="Tonight (live)" />
                  {player.lastGame && (
                    <StatBreakdown stats={player.lastGame} label="Last game" />
                  )}
                  {player.gamesPlayed === 0 && (
                    <p className="mt-2 text-xs text-zinc-500">
                      No prior games in this series
                    </p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
