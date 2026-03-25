"use client";

interface ScoreBadgeProps {
  period: number;
  isFinal: boolean;
  status: string;
}

export function ScoreBadge({ period, isFinal, status }: ScoreBadgeProps) {
  if (isFinal || status === "final") {
    return (
      <span className="rounded-full bg-zinc-700 px-2.5 py-0.5 text-xs font-bold text-zinc-300">
        FINAL
      </span>
    );
  }

  if (status === "active" && period > 0) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-green-900/40 px-2.5 py-0.5 text-xs font-bold text-green-400">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-400" />
        LIVE &middot; Q{period}
      </span>
    );
  }

  return (
    <span className="rounded-full bg-zinc-800 px-2.5 py-0.5 text-xs font-medium text-zinc-500">
      {status === "draft-open" ? "DRAFTING" : "PENDING"}
    </span>
  );
}
