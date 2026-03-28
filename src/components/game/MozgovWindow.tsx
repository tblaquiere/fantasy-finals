"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";

import { api } from "~/trpc/react";
import { MOZGOV_POLL_INTERVAL_MS } from "~/lib/constants";

interface MozgovWindowProps {
  gameId: string;
  leagueId: string;
}

export function MozgovWindow({ gameId, leagueId }: MozgovWindowProps) {
  const { data: status, isLoading } = api.game.getMozgovStatus.useQuery(
    { gameId },
    {
      refetchInterval: (query) => {
        const d = query.state.data;
        if (!d) return MOZGOV_POLL_INTERVAL_MS;
        const hasActive = d.windows.some(
          (w) => w.status === "pending" || w.status === "active",
        );
        return hasActive ? MOZGOV_POLL_INTERVAL_MS : false;
      },
      refetchIntervalInBackground: false,
    },
  );

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl bg-zinc-900" />
        ))}
      </div>
    );
  }

  if (!status || status.windows.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-zinc-500">
        No Mozgov windows for this game
      </p>
    );
  }

  const activeWindow = status.windows.find((w) => w.status === "active");

  return (
    <div className="space-y-4">
      {/* Window queue */}
      <ul className="space-y-2">
        {status.windows.map((w) => (
          <li
            key={w.id}
            className={`rounded-xl px-4 py-3 ${
              w.status === "active"
                ? "border border-red-500/30 bg-red-950/20"
                : "bg-zinc-900"
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-sm font-medium ${w.isMe ? "text-red-400" : "text-zinc-100"}`}>
                  {w.participantName}
                  {w.isMe && " (You)"}
                </p>
                <p className="text-xs text-zinc-500">
                  {w.originalPlayerName}{" "}
                  <span className="text-zinc-600">{w.originalPlayerTeam}</span>
                  {" — "}
                  {w.originalPlayerMinutes} min played
                </p>
              </div>
              <WindowStatusBadge
                status={w.status}
                clockExpiresAt={w.clockExpiresAt}
              />
            </div>
          </li>
        ))}
      </ul>

      {/* Replacement picker — only shown when it's my turn */}
      {status.isMyTurn && activeWindow && (
        <MozgovReplacementPicker
          gameId={gameId}
          leagueId={leagueId}
          windowId={activeWindow.id}
        />
      )}
    </div>
  );
}

function WindowStatusBadge({
  status,
  clockExpiresAt,
}: {
  status: string;
  clockExpiresAt: Date | string | null;
}) {
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    if (status !== "active" || !clockExpiresAt) return;

    const update = () => {
      const expires = new Date(clockExpiresAt).getTime();
      const remaining = Math.max(0, expires - Date.now());
      const mins = Math.floor(remaining / 60000);
      const secs = Math.floor((remaining % 60000) / 1000);
      setTimeLeft(`${mins}:${secs.toString().padStart(2, "0")}`);
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [status, clockExpiresAt]);

  if (status === "completed") {
    return (
      <span className="rounded-full bg-green-900/30 px-2.5 py-0.5 text-xs font-medium text-green-400">
        Replaced
      </span>
    );
  }
  if (status === "expired") {
    return (
      <span className="rounded-full bg-zinc-800 px-2.5 py-0.5 text-xs font-medium text-zinc-500">
        Expired
      </span>
    );
  }
  if (status === "active") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-900/40 px-2.5 py-0.5 text-xs font-bold text-red-400">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" />
        {timeLeft}
      </span>
    );
  }
  return (
    <span className="rounded-full bg-zinc-800 px-2.5 py-0.5 text-xs font-medium text-zinc-500">
      Waiting
    </span>
  );
}

function MozgovReplacementPicker({
  gameId,
  leagueId,
  windowId,
}: {
  gameId: string;
  leagueId: string;
  windowId: string;
}) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);

  const { data: players, isLoading } =
    api.game.getMozgovEligiblePlayers.useQuery(
      { gameId, windowId },
      { refetchInterval: MOZGOV_POLL_INTERVAL_MS },
    );

  const utils = api.useUtils();
  const submitMutation = api.draft.submitMozgovReplacement.useMutation({
    onSuccess: () => {
      toast.success("Replacement confirmed — full game credit!");
      void utils.game.getMozgovStatus.invalidate({ gameId });
      setSelectedId(null);
      setConfirming(false);
    },
    onError: (err) => {
      toast.error(err.message);
      setConfirming(false);
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-xl bg-zinc-900" />
        ))}
      </div>
    );
  }

  if (!players || players.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-zinc-500">
        No eligible replacement players
      </p>
    );
  }

  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-zinc-300">
        Choose Replacement
      </h3>
      <ul className="space-y-1.5">
        {players.map((p) => {
          const isSelected = selectedId === p.personId;
          return (
            <li key={p.personId}>
              <button
                type="button"
                onClick={() => {
                  setSelectedId(isSelected ? null : p.personId);
                  setConfirming(false);
                }}
                className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors ${
                  isSelected
                    ? "border border-red-500/40 bg-red-950/20"
                    : "bg-zinc-900 hover:bg-zinc-800"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-100">
                    {p.firstName.charAt(0)}. {p.familyName}
                    <span className="ml-1.5 text-xs text-zinc-500">
                      {p.teamTricode}
                    </span>
                  </p>
                  <p className="text-[10px] text-zinc-600 tabular-nums">
                    {p.minutes}min {p.points}p {p.rebounds}r {p.assists}a{" "}
                    {p.steals}s {p.blocks}b
                  </p>
                </div>
                <span className="text-sm font-bold tabular-nums text-orange-500">
                  {p.fantasyPoints} FP
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {selectedId !== null && !confirming && (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="mt-3 w-full rounded-xl bg-red-600 px-4 py-3 text-sm font-semibold text-white hover:bg-red-500"
        >
          Confirm Replacement
        </button>
      )}

      {confirming && selectedId !== null && (
        <div className="mt-3 space-y-2 rounded-xl border border-red-500/30 bg-red-950/20 p-4">
          <p className="text-sm text-zinc-300">
            Full game credit. Every point counts.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="flex-1 rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-700"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={submitMutation.isPending}
              onClick={() =>
                submitMutation.mutate({
                  windowId,
                  nbaPlayerId: selectedId,
                  leagueId,
                  gameId,
                })
              }
              className="flex-1 rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50"
            >
              {submitMutation.isPending ? "Submitting..." : "Replace Player"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
