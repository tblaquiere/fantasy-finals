import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { BottomNav } from "~/components/shared/BottomNav";

export default async function LeagueIndexPage() {
  const session = await auth();
  if (!session) redirect("/sign-in");

  const participations = await db.participant.findMany({
    where: { userId: session.user.id },
    include: {
      league: { select: { id: true, name: true, seriesId: true } },
    },
    orderBy: { joinedAt: "desc" },
  });

  // If user has exactly one league, go straight there
  if (participations.length === 1) {
    redirect(`/league/${participations[0]!.league.id}`);
  }

  return (
    <main className="min-h-screen bg-zinc-950 pb-16 text-zinc-50">
      <div className="mx-auto max-w-xl px-4 py-6">
        <h1 className="mb-4 text-lg font-bold text-orange-500">My Leagues</h1>

        {participations.length === 0 ? (
          <div className="space-y-4">
            <p className="text-sm text-zinc-500">
              You haven&apos;t joined any leagues yet.
            </p>
            <Link
              href="/league/new"
              className="inline-block rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-500"
            >
              Create a League
            </Link>
          </div>
        ) : (
          <ul className="space-y-2">
            {participations.map((p) => (
              <li key={p.league.id}>
                <Link
                  href={`/league/${p.league.id}`}
                  className="flex items-center justify-between rounded-xl bg-zinc-900 px-4 py-3 hover:bg-zinc-800"
                >
                  <div>
                    <p className="text-sm font-medium text-zinc-100">
                      {p.league.name}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {p.league.seriesId}
                    </p>
                  </div>
                  {p.isCommissioner && (
                    <span className="rounded-full bg-orange-500/20 px-2 py-0.5 text-xs font-medium text-orange-400">
                      Commissioner
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      <BottomNav />
    </main>
  );
}
