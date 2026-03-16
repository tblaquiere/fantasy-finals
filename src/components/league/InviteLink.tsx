"use client";

import { useEffect, useState } from "react";

import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";

interface InviteLinkProps {
  leagueId: string;
  initialToken: string;
}

export function InviteLink({ leagueId, initialToken }: InviteLinkProps) {
  const [token, setToken] = useState(initialToken);
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("");

  useEffect(() => setOrigin(window.location.origin), []);

  const inviteUrl = origin ? `${origin}/join/${token}` : "";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: prompt user to copy manually
      alert("Copy failed — please select the URL and copy manually.");
    }
  };

  const regenerate = api.league.regenerateInviteToken.useMutation({
    onSuccess: ({ token: newToken }) => setToken(newToken),
  });

  const handleRegenerate = () => {
    if (confirm("Regenerate? The current invite link will stop working.")) {
      regenerate.mutate({ leagueId });
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-zinc-400">Share this link to invite friends to your league.</p>
      <div className="flex gap-2">
        <Input
          readOnly
          value={inviteUrl}
          className="border-zinc-700 bg-zinc-800 text-sm text-zinc-300"
        />
        <Button
          onClick={handleCopy}
          disabled={!origin}
          className="shrink-0 bg-orange-500 text-white hover:bg-orange-600"
        >
          {copied ? "Copied!" : "Copy Link"}
        </Button>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleRegenerate}
        disabled={regenerate.isPending}
        className="text-zinc-400 hover:text-zinc-200"
      >
        {regenerate.isPending ? "Regenerating…" : "Regenerate link"}
      </Button>
      {regenerate.isError && (
        <p className="text-sm text-red-400">{regenerate.error.message}</p>
      )}
    </div>
  );
}
