import { notFound, redirect } from "next/navigation";
import { TRPCError } from "@trpc/server";

import { auth } from "~/server/auth";
import { createCaller } from "~/server/api/root";
import { db } from "~/server/db";
import { PlayerList } from "~/components/draft/PlayerList";
import { BottomNav } from "~/components/shared/BottomNav";

interface Props {
  params: Promise<{ gameId: string }>;
  searchParams: Promise<{ leagueId?: string }>;
}

export default async function PickPage({ params, searchParams }: Props) {
  const { gameId } = await params;
  const { leagueId } = await searchParams;
  const session = await auth();
  if (!session) redirect("/sign-in");
  if (!leagueId) notFound();

  const caller = createCaller({ db, session, headers: new Headers() });

  let data;
  try {
    data = await caller.draft.getEligiblePlayers({ leagueId, gameId });
  } catch (err) {
    if (err instanceof TRPCError && err.code === "FORBIDDEN") {
      return (
        <main className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-50">
          <p className="text-zinc-400">You are not a member of this league.</p>
        </main>
      );
    }
    notFound();
  }

  return (
    <main className="min-h-screen bg-zinc-950 pb-16 text-zinc-50">
      <div className="mx-auto max-w-xl px-4 py-4">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-lg font-bold text-orange-500">Pick a Player</h1>
          <span className="text-xs text-zinc-400">
            {data.awayTeam.teamTricode} @ {data.homeTeam.teamTricode}
          </span>
        </div>
        <PlayerList players={data.players} gameId={gameId} leagueId={leagueId} />
      </div>
      <BottomNav />
    </main>
  );
}
