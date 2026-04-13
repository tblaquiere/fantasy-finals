"use client";

import { useState } from "react";
import { toast } from "sonner";

import { api } from "~/trpc/react";
import { cn } from "~/lib/utils";

interface DraftControlsProps {
  leagueId: string;
}

export function DraftControls({ leagueId }: DraftControlsProps) {
  const [expandedGameId, setExpandedGameId] = useState<string | null>(null);
  const utils = api.useUtils();

  const { data: leaderboardData, isLoading } =
    api.standing.getLeaderboard.useQuery({ leagueId });

  const generateOrder = api.draft.generateDraftOrder.useMutation({
    onSuccess: () => {
      toast.success("Draft order generated");
      void utils.draft.getDraftStatus.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const openDraft = api.draft.openDraftWindow.useMutation({
    onSuccess: () => {
      toast.success("Draft window opened");
      void utils.draft.getDraftStatus.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const closeDraft = api.draft.closeDraftWindow.useMutation({
    onSuccess: () => {
      toast.success("Draft window closed");
      void utils.draft.getDraftStatus.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  if (isLoading || !leaderboardData) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-xl bg-zinc-900" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {leaderboardData.games.map((game) => (
        <div key={game.id}>
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
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-medium",
                game.status === "drafting"
                  ? "bg-green-500/20 text-green-400"
                  : game.status === "active"
                    ? "bg-blue-500/20 text-blue-400"
                    : game.isFinal
                      ? "bg-zinc-700 text-zinc-400"
                      : "bg-zinc-800 text-zinc-500",
              )}
            >
              {game.status}
            </span>
          </button>
          {expandedGameId === game.id && (
            <GameControls
              leagueId={leagueId}
              gameId={game.id}
              gameStatus={game.status}
              onGenerateOrder={() =>
                generateOrder.mutate({ leagueId, nbaGameId: game.nbaGameId })
              }
              onOpenDraft={() =>
                openDraft.mutate({ leagueId, gameId: game.id })
              }
              onCloseDraft={() =>
                closeDraft.mutate({ leagueId, gameId: game.id })
              }
              isGenerating={generateOrder.isPending}
              isOpening={openDraft.isPending}
              isClosing={closeDraft.isPending}
            />
          )}
        </div>
      ))}
    </div>
  );
}

function GameControls({
  leagueId,
  gameId,
  gameStatus,
  onGenerateOrder,
  onOpenDraft,
  onCloseDraft,
  isGenerating,
  isOpening,
  isClosing,
}: {
  leagueId: string;
  gameId: string;
  gameStatus: string;
  onGenerateOrder: () => void;
  onOpenDraft: () => void;
  onCloseDraft: () => void;
  isGenerating: boolean;
  isOpening: boolean;
  isClosing: boolean;
}) {
  const { data: draftStatus, isLoading } = api.draft.getDraftStatus.useQuery({
    leagueId,
    gameId,
  });

  return (
    <div className="mt-1 rounded-xl bg-zinc-900/50 p-4 space-y-3">
      {isLoading ? (
        <div className="h-20 animate-pulse rounded bg-zinc-800" />
      ) : draftStatus ? (
        <>
          <div className="grid grid-cols-2 gap-2 text-xs text-zinc-400">
            <div>
              <span className="text-zinc-600">Status: </span>
              {draftStatus.status}
            </div>
            <div>
              <span className="text-zinc-600">Slots: </span>
              {draftStatus.slots.length}
            </div>
            {draftStatus.activeSlot && (
              <div className="col-span-2">
                <span className="text-zinc-600">On clock: </span>
                Pick #{draftStatus.activeSlot.pickPosition}
                {draftStatus.activeSlot.clockExpiresAt && (
                  <span className="text-zinc-500">
                    {" "}(expires {new Date(draftStatus.activeSlot.clockExpiresAt).toLocaleTimeString()})
                  </span>
                )}
              </div>
            )}
            {draftStatus.draftOpensAt && (
              <div>
                <span className="text-zinc-600">Opens: </span>
                {new Date(draftStatus.draftOpensAt).toLocaleTimeString()}
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {gameStatus === "pending" && (
              <>
                <ActionButton
                  onClick={onGenerateOrder}
                  disabled={isGenerating}
                  variant="secondary"
                >
                  {isGenerating ? "Generating..." : "Generate Draft Order"}
                </ActionButton>
                <ActionButton
                  onClick={onOpenDraft}
                  disabled={isOpening}
                  variant="primary"
                >
                  {isOpening ? "Opening..." : "Open Draft"}
                </ActionButton>
              </>
            )}
            {gameStatus === "drafting" && (
              <ActionButton
                onClick={onCloseDraft}
                disabled={isClosing}
                variant="danger"
              >
                {isClosing ? "Closing..." : "Close Draft"}
              </ActionButton>
            )}
          </div>
        </>
      ) : (
        <p className="text-xs text-zinc-500">No draft data available</p>
      )}

      <div className="border-t border-zinc-800 pt-2">
        <p className="text-[10px] text-zinc-600">
          Draft page:{" "}
          <a
            href={`/draft/${gameId}?leagueId=${leagueId}`}
            className="text-orange-400 underline"
          >
            /draft/{gameId.slice(0, 8)}...
          </a>
          {" | "}
          <a
            href={`/draft/${gameId}/pick?leagueId=${leagueId}`}
            className="text-orange-400 underline"
          >
            Pick page
          </a>
        </p>
      </div>
    </div>
  );
}

function ActionButton({
  onClick,
  disabled,
  variant,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  variant: "primary" | "secondary" | "danger";
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "min-h-[36px] rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50",
        variant === "primary" && "bg-orange-500 text-zinc-950 hover:bg-orange-400",
        variant === "secondary" && "bg-zinc-800 text-zinc-300 hover:bg-zinc-700",
        variant === "danger" && "bg-red-500/20 text-red-400 hover:bg-red-500/30",
      )}
    >
      {children}
    </button>
  );
}
