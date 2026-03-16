import { redirect } from "next/navigation";

import { auth } from "~/server/auth";
import { createCaller } from "~/server/api/root";
import { db } from "~/server/db";
import { SERIES_STUBS } from "~/lib/constants";
import { RecalculateButton } from "~/components/admin/RecalculateButton";
import { BottomNav } from "~/components/shared/BottomNav";

export default async function AdminPage() {
  const session = await auth();
  if (!session) redirect("/sign-in");

  if (session.user.role !== "admin") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-50">
        <p className="text-zinc-400">Admin access required.</p>
      </main>
    );
  }

  const caller = createCaller({ db, session, headers: new Headers() });
  const leagues = await caller.league.getAllLeagues();

  return (
    <main className="min-h-screen bg-zinc-950 pb-16 text-zinc-50">
      <div className="mx-auto max-w-3xl px-4 py-6">
        <h1 className="mb-1 text-2xl font-bold text-orange-500">Admin Panel</h1>
        <p className="mb-6 text-sm text-zinc-400">
          {leagues.length} league{leagues.length !== 1 ? "s" : ""} on platform
        </p>

        <div className="space-y-3">
          {leagues.map((league) => {
            const seriesName =
              SERIES_STUBS.find((s) => s.id === league.seriesId)?.name ?? league.seriesId;
            const commLabel =
              league.commissioner?.name ?? league.commissioner?.email ?? "Unknown";
            return (
              <div
                key={league.leagueId}
                className="flex items-center justify-between rounded-xl bg-zinc-900 px-4 py-4"
              >
                <div>
                  <p className="font-semibold text-zinc-100">{league.leagueName}</p>
                  <p className="mt-0.5 text-sm text-zinc-400">{seriesName}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {league.participantCount} participant
                    {league.participantCount !== 1 ? "s" : ""} · Commissioner: {commLabel}
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-600">Phase: Pre-draft</p>
                </div>
                <RecalculateButton
                  leagueId={league.leagueId}
                  leagueName={league.leagueName}
                />
              </div>
            );
          })}
          {leagues.length === 0 && (
            <p className="py-12 text-center text-zinc-500">No leagues yet.</p>
          )}
        </div>
      </div>
      <BottomNav isAdmin />
    </main>
  );
}
