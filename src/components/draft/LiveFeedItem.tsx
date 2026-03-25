"use client";

import { cn } from "~/lib/utils";

interface LiveFeedItemProps {
  pickPosition: number;
  participantName: string;
  playerFirstName: string;
  playerFamilyName: string;
  playerTeamTricode: string;
  method: string;
  overridden?: boolean;
  isNew?: boolean;
}

function getMethodLabel(method: string): string | null {
  if (method === "auto-preference") return "auto \u2014 preference list";
  if (method === "auto-system") return "auto \u2014 system";
  return null;
}

export function LiveFeedItem({
  pickPosition,
  participantName,
  playerFirstName,
  playerFamilyName,
  playerTeamTricode,
  method,
  overridden = false,
  isNew = false,
}: LiveFeedItemProps) {
  const methodLabel = getMethodLabel(method);

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl bg-zinc-900 px-4 py-3 transition-all",
        isNew && "animate-feed-enter",
      )}
    >
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-orange-500/20 text-xs font-bold text-orange-400">
        #{pickPosition}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-zinc-100">
          <span className="font-medium">{participantName}</span>
          {" picked "}
          <span className="font-medium">
            {playerFirstName.charAt(0)}. {playerFamilyName}
          </span>
        </p>
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <span>{playerTeamTricode}</span>
          {methodLabel && (
            <>
              <span className="text-zinc-700">&middot;</span>
              <span className="italic text-zinc-500">{methodLabel}</span>
            </>
          )}
          {overridden && (
            <>
              <span className="text-zinc-700">&middot;</span>
              <span className="font-medium text-yellow-500">overridden</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
