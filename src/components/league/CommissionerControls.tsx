"use client";

import { useState } from "react";

import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";

interface Participant {
  userId: string;
  name: string | null;
  email: string | null;
  isCommissioner: boolean;
}

interface CommissionerControlsProps {
  leagueId: string;
  participants: Participant[];
}

function displayName(p: Participant): string {
  return p.name ?? p.email ?? p.userId;
}

export function CommissionerControls({ leagueId, participants }: CommissionerControlsProps) {
  const nonCommissioners = participants.filter((p) => !p.isCommissioner);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [transferred, setTransferred] = useState(false);

  const delegate = api.league.delegateCommissioner.useMutation({
    onSuccess: () => setTransferred(true),
  });

  if (nonCommissioners.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        Add participants to your league before delegating.
      </p>
    );
  }

  if (transferred) {
    return (
      <p className="text-sm text-green-400">
        Commissioner role transferred. The new commissioner will need to sign out and back in to
        access all commissioner controls.
      </p>
    );
  }

  const selectedParticipant = nonCommissioners.find((p) => p.userId === selectedUserId);

  const handleTransfer = () => {
    if (!selectedUserId) return;
    const name = selectedParticipant ? displayName(selectedParticipant) : "this participant";
    if (confirm(`Transfer commissioner role to ${name}? You will become a regular participant.`)) {
      delegate.mutate({ leagueId, newCommissionerId: selectedUserId });
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-zinc-400">
        Transfer your commissioner role to another participant.
      </p>
      <div className="flex gap-2">
        <select
          value={selectedUserId}
          onChange={(e) => setSelectedUserId(e.target.value)}
          className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-300 focus:border-orange-500 focus:outline-none"
        >
          <option value="">Select participant…</option>
          {nonCommissioners.map((p) => (
            <option key={p.userId} value={p.userId}>
              {displayName(p)}
            </option>
          ))}
        </select>
        <Button
          onClick={handleTransfer}
          disabled={!selectedUserId || delegate.isPending}
          variant="destructive"
          className="shrink-0"
        >
          {delegate.isPending ? "Transferring…" : "Transfer"}
        </Button>
      </div>
      {delegate.isError && (
        <p className="text-sm text-red-400">{delegate.error.message}</p>
      )}
    </div>
  );
}
