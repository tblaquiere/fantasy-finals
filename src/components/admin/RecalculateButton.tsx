"use client";

import { useState } from "react";

import { api } from "~/trpc/react";

interface RecalculateButtonProps {
  leagueId: string;
  leagueName: string;
}

export function RecalculateButton({ leagueId, leagueName }: RecalculateButtonProps) {
  const [feedback, setFeedback] = useState<string | null>(null);

  const recalculate = api.admin.recalculateDraftOrder.useMutation({
    onSuccess: (data) => {
      setFeedback(`${leagueName}: ${data.message}`);
      setTimeout(() => setFeedback(null), 3000);
    },
    onError: (err) => {
      setFeedback(`Error: ${err.message}`);
      setTimeout(() => setFeedback(null), 3000);
    },
  });

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => recalculate.mutate({ leagueId })}
        disabled={recalculate.isPending}
        className="rounded-lg bg-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-600 disabled:opacity-50"
      >
        {recalculate.isPending ? "Recalculating…" : "Recalculate Draft Order"}
      </button>
      {feedback && (
        <p className="max-w-[200px] text-right text-xs text-zinc-400">{feedback}</p>
      )}
    </div>
  );
}
