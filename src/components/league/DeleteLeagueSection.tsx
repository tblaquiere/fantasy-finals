"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";

interface DeleteLeagueSectionProps {
  leagueId: string;
  leagueName: string;
}

export function DeleteLeagueSection({ leagueId, leagueName }: DeleteLeagueSectionProps) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [confirmationName, setConfirmationName] = useState("");

  const softDelete = api.league.softDeleteLeague.useMutation({
    onSuccess: () => {
      toast.success("League moved to Recently Deleted");
      router.push("/dashboard");
      router.refresh();
    },
    onError: (err) => toast.error(err.message),
  });

  const nameMatches = confirmationName.trim() === leagueName;

  return (
    <div className="rounded-xl border border-red-900/40 bg-zinc-900 p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-red-400">
        Danger Zone
      </h2>
      {!expanded ? (
        <div className="space-y-2">
          <p className="text-sm text-zinc-400">
            Delete this league. It will move to Recently Deleted and can be restored or
            permanently removed later.
          </p>
          <Button variant="destructive" onClick={() => setExpanded(true)}>
            Delete League
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-lg border border-red-900/40 bg-red-950/30 p-3">
            <p className="mb-2 text-sm font-medium text-red-300">
              This will hide the league from all participants.
            </p>
            <p className="text-xs text-zinc-400">
              Picks, preference lists, and series history are preserved. Restore or
              permanent deletion can be done from the dashboard.
            </p>
          </div>
          <label className="block text-xs text-zinc-400">
            Type <span className="font-mono text-zinc-200">{leagueName}</span> to confirm:
          </label>
          <input
            type="text"
            value={confirmationName}
            onChange={(e) => setConfirmationName(e.target.value)}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:border-orange-500 focus:outline-none"
            placeholder={leagueName}
            autoFocus
          />
          <div className="flex gap-2">
            <Button
              variant="destructive"
              disabled={!nameMatches || softDelete.isPending}
              onClick={() => softDelete.mutate({ leagueId, confirmationName })}
            >
              {softDelete.isPending ? "Deleting…" : "Delete League"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setExpanded(false);
                setConfirmationName("");
              }}
              disabled={softDelete.isPending}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
