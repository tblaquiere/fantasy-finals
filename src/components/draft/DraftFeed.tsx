"use client";

import { useRef } from "react";
import { api } from "~/trpc/react";
import { LiveFeedItem } from "./LiveFeedItem";
import { Skeleton } from "~/components/ui/skeleton";
import { DRAFT_FEED_POLL_INTERVAL_MS } from "~/lib/constants";

interface DraftFeedProps {
  gameId: string;
  leagueId: string;
}

export function DraftFeed({ gameId, leagueId }: DraftFeedProps) {
  const prevCountRef = useRef(0);

  const { data, isLoading } = api.draft.getFeed.useQuery(
    { gameId, leagueId },
    {
      refetchInterval: (query) => {
        const status = query.state.data?.status;
        // Only poll while draft is open
        return status === "draft-open" ? DRAFT_FEED_POLL_INTERVAL_MS : false;
      },
      refetchIntervalInBackground: false,
    },
  );

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (!data) return null;

  const isDraftOpen = data.status === "draft-open";
  const pickCount = data.picks.length;
  const prevCount = prevCountRef.current;
  prevCountRef.current = pickCount;

  return (
    <div className="space-y-3">
      {isDraftOpen && (
        <div className="flex items-center gap-2 rounded-lg bg-orange-500/10 px-3 py-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-orange-500" />
          </span>
          <span className="text-xs font-semibold uppercase tracking-wider text-orange-400">
            Draft Open
          </span>
        </div>
      )}

      {data.picks.length === 0 ? (
        <p className="py-8 text-center text-sm text-zinc-500">
          {isDraftOpen ? "Waiting for first pick..." : "No picks yet"}
        </p>
      ) : (
        <ul className="space-y-1">
          {data.picks.map((pick, index) => (
            <li key={pick.id}>
              <LiveFeedItem
                pickPosition={pick.pickPosition}
                participantName={pick.participantName}
                playerFirstName={pick.playerFirstName}
                playerFamilyName={pick.playerFamilyName}
                playerTeamTricode={pick.playerTeamTricode}
                method={pick.method}
                overridden={pick.overridden}
                isNew={index >= prevCount && prevCount > 0}
              />
            </li>
          ))}
        </ul>
      )}

      {!isDraftOpen && data.picks.length > 0 && (
        <p className="text-center text-xs text-zinc-600">
          Draft complete — {data.picks.length} pick{data.picks.length !== 1 && "s"}
        </p>
      )}
    </div>
  );
}
