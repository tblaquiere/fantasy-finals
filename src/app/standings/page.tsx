import { redirect } from "next/navigation";

import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { BottomNav } from "~/components/shared/BottomNav";
import { SeriesLeaderboard } from "~/components/standings/SeriesLeaderboard";

export default async function StandingsPage() {
  const session = await auth();
  if (!session) redirect("/sign-in");

  // Get user's leagues
  const participations = await db.participant.findMany({
    where: { userId: session.user.id },
    include: { league: { select: { id: true, name: true } } },
    orderBy: { joinedAt: "desc" },
  });

  if (participations.length === 0) {
    return (
      <main className="min-h-screen bg-zinc-950 pb-16 text-zinc-50">
        <div className="mx-auto max-w-xl px-4 py-6">
          <h1 className="mb-4 text-lg font-bold text-orange-500">Standings</h1>
          <p className="text-sm text-zinc-500">
            Join a league to see standings.
          </p>
        </div>
        <BottomNav />
      </main>
    );
  }

  // Show standings for first league (most leagues will have one active)
  const league = participations[0]!.league;

  return (
    <main className="min-h-screen bg-zinc-950 pb-16 text-zinc-50">
      <div className="mx-auto max-w-xl px-4 py-4">
        <h1 className="mb-1 text-lg font-bold text-orange-500">Standings</h1>
        <p className="mb-4 text-xs text-zinc-500">{league.name}</p>
        <SeriesLeaderboard leagueId={league.id} />
      </div>
      <BottomNav />
    </main>
  );
}
