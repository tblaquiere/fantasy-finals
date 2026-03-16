import { redirect } from "next/navigation";

import { auth } from "~/server/auth";
import { createCaller } from "~/server/api/root";
import { db } from "~/server/db";
import { SERIES_STUBS } from "~/lib/constants";
import { LeagueCard } from "~/components/league/LeagueCard";
import { EmptyDashboard } from "~/components/league/EmptyDashboard";
import { BottomNav } from "~/components/shared/BottomNav";
import { PushPermissionPrompt } from "~/components/shared/PushPermissionPrompt";

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect("/sign-in");

  const caller = createCaller({ db, session, headers: new Headers() });
  const leagues = await caller.league.getMyLeagues();

  return (
    <main className="min-h-screen bg-zinc-950 pb-16 text-zinc-50">
      <div className="mx-auto max-w-xl px-4 py-6">
        <h1 className="mb-1 text-2xl font-bold text-orange-500">Fantasy Finals</h1>
        <p className="mb-6 text-sm text-zinc-400">{session.user.email}</p>

        {leagues.length === 0 ? (
          <EmptyDashboard />
        ) : (
          <div className="space-y-3">
            {leagues.map((league) => {
              const seriesName =
                SERIES_STUBS.find((s) => s.id === league.seriesId)?.name ?? league.seriesId;
              return (
                <LeagueCard
                  key={league.leagueId}
                  leagueId={league.leagueId}
                  leagueName={league.leagueName}
                  seriesName={seriesName}
                  participantCount={league.participantCount}
                  isCommissioner={league.isCommissioner}
                />
              );
            })}
          </div>
        )}

        <PushPermissionPrompt />
      </div>
      <BottomNav isAdmin={session.user.role === "admin"} />
    </main>
  );
}
