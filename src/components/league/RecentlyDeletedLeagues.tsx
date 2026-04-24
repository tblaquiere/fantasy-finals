"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { api } from "~/trpc/react";
import { SERIES_STUBS } from "~/lib/constants";
import { Button } from "~/components/ui/button";

interface DeletedLeague {
  leagueId: string;
  leagueName: string;
  seriesId: string;
  deletedAt: Date;
}

function seriesDisplayName(seriesId: string): string {
  return SERIES_STUBS.find((s) => s.id === seriesId)?.name ?? seriesId;
}

function relativeTime(date: Date): string {
  const ms = Date.now() - new Date(date).getTime();
  const days = Math.floor(ms / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

function PermanentDeleteRow({ league, onDeleted }: { league: DeletedLeague; onDeleted: () => void }) {
  const [confirmationName, setConfirmationName] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);

  const permanentDelete = api.league.permanentlyDeleteLeague.useMutation({
    onSuccess: () => {
      toast.success("League permanently deleted");
      onDeleted();
    },
    onError: (err) => toast.error(err.message),
  });

  const nameMatches = confirmationName.trim() === league.leagueName;

  if (!showConfirm) {
    return (
      <Button variant="destructive" size="sm" onClick={() => setShowConfirm(true)}>
        Permanently Delete
      </Button>
    );
  }

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-red-900/40 bg-red-950/30 p-3">
      <p className="text-xs font-medium text-red-300">
        This will permanently erase the league, all picks, and all series history. This
        cannot be undone.
      </p>
      <label className="block text-xs text-zinc-400">
        Type <span className="font-mono text-zinc-200">{league.leagueName}</span> to confirm:
      </label>
      <input
        type="text"
        value={confirmationName}
        onChange={(e) => setConfirmationName(e.target.value)}
        className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs text-zinc-100 focus:border-orange-500 focus:outline-none"
        placeholder={league.leagueName}
        autoFocus
      />
      <div className="flex gap-2">
        <Button
          variant="destructive"
          size="sm"
          disabled={!nameMatches || permanentDelete.isPending}
          onClick={() =>
            permanentDelete.mutate({ leagueId: league.leagueId, confirmationName })
          }
        >
          {permanentDelete.isPending ? "Deleting…" : "Confirm Permanent Delete"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setShowConfirm(false);
            setConfirmationName("");
          }}
          disabled={permanentDelete.isPending}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

function DeletedLeagueRow({ league, onChange }: { league: DeletedLeague; onChange: () => void }) {
  const restore = api.league.restoreLeague.useMutation({
    onSuccess: () => {
      toast.success("League restored");
      onChange();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="rounded-xl bg-zinc-900 p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-zinc-100">{league.leagueName}</p>
          <p className="mt-0.5 text-xs text-zinc-500">
            {seriesDisplayName(league.seriesId)} — deleted {relativeTime(league.deletedAt)}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => restore.mutate({ leagueId: league.leagueId })}
          disabled={restore.isPending}
        >
          {restore.isPending ? "Restoring…" : "Restore"}
        </Button>
        <PermanentDeleteRow league={league} onDeleted={onChange} />
      </div>
    </div>
  );
}

export function RecentlyDeletedLeagues() {
  const router = useRouter();
  const query = api.league.getMyDeletedLeagues.useQuery();

  const onChange = () => {
    void query.refetch();
    router.refresh();
  };

  if (query.isLoading) return null;
  if (!query.data || query.data.length === 0) return null;

  return (
    <div className="mt-8">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
        Recently Deleted
      </h2>
      <div className="space-y-3">
        {query.data.map((league) => (
          <DeletedLeagueRow key={league.leagueId} league={league} onChange={onChange} />
        ))}
      </div>
    </div>
  );
}
