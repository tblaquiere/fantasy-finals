"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export function EmptyDashboard() {
  const [inviteInput, setInviteInput] = useState("");
  const router = useRouter();

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    const match = /\/join\/([^/?#]+)/.exec(inviteInput);
    const token = match ? match[1] : inviteInput.trim();
    if (token) router.push(`/join/${token}`);
  };

  return (
    <div className="flex flex-col items-center gap-6 py-12 text-center">
      <p className="text-zinc-400">No leagues yet — create one or join via invite link.</p>
      <Link
        href="/league/new"
        className="rounded-xl bg-orange-500 px-6 py-3 text-sm font-bold text-white hover:bg-orange-600"
      >
        Create League
      </Link>
      <form onSubmit={handleJoin} className="flex w-full max-w-sm gap-2">
        <input
          type="text"
          value={inviteInput}
          onChange={(e) => setInviteInput(e.target.value)}
          placeholder="Paste invite link or token…"
          className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-300 placeholder-zinc-500 focus:border-orange-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={!inviteInput.trim()}
          className="rounded-lg bg-zinc-700 px-4 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-600 disabled:opacity-50"
        >
          Join
        </button>
      </form>
    </div>
  );
}
