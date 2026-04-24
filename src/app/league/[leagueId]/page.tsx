import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { TRPCError } from "@trpc/server";

import { auth } from "~/server/auth";
import { createCaller } from "~/server/api/root";
import { db } from "~/server/db";
import { SERIES_STUBS } from "~/lib/constants";
import { BottomNav } from "~/components/shared/BottomNav";
import { NextDraftOrder } from "~/components/league/NextDraftOrder";

interface Props {
  params: Promise<{ leagueId: string }>;
}

export default async function LeagueHomePage({ params }: Props) {
  const { leagueId } = await params;
  const session = await auth();
  if (!session) redirect("/sign-in");

  const caller = createCaller({ db, session, headers: new Headers() });

  let league;
  try {
    league = await caller.league.getLeague({ leagueId });
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

  const series = SERIES_STUBS.find((s) => s.id === league.seriesId);
  const isCommissioner = league.participants.some(
    (p) => p.isCommissioner && p.user.id === session.user.id,
  );

  return (
    <main className="min-h-screen bg-zinc-950 pb-16 text-zinc-50">
      <div className="mx-auto max-w-xl px-4 py-6">
        <h1 className="mb-1 text-2xl font-bold text-orange-500">
          {league.name}
        </h1>
        <p className="mb-6 text-sm text-zinc-400">
          {series?.name ?? league.seriesId}
        </p>

        {/* Participants */}
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">
          Participants
        </h2>
        <ul className="space-y-2">
          {league.participants.map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-3 rounded-xl bg-zinc-900 px-4 py-3"
            >
              <span className="text-zinc-100">
                {p.user.name ?? p.user.email}
              </span>
              {p.isCommissioner && (
                <span className="rounded-full bg-orange-500/20 px-2 py-0.5 text-xs font-medium text-orange-400">
                  Commissioner
                </span>
              )}
            </li>
          ))}
        </ul>

        <NextDraftOrder leagueId={league.id} currentUserId={session.user.id} />

        {/* Management links */}
        <div className="mt-6 space-y-2">
          <Link
            href={`/league/${league.id}/preferences`}
            className="flex items-center justify-between rounded-xl bg-zinc-900 px-4 py-3 hover:bg-zinc-800"
          >
            <span className="text-sm text-zinc-100">Set Preferences</span>
            <span className="text-zinc-600">&rsaquo;</span>
          </Link>
          <Link
            href={`/league/${league.id}/roster`}
            className="flex items-center justify-between rounded-xl bg-zinc-900 px-4 py-3 hover:bg-zinc-800"
          >
            <span className="text-sm text-zinc-100">Series Roster</span>
            <span className="text-zinc-600">&rsaquo;</span>
          </Link>
          {isCommissioner && (
            <Link
              href={`/league/${league.id}/settings`}
              className="flex items-center justify-between rounded-xl bg-zinc-900 px-4 py-3 hover:bg-zinc-800"
            >
              <span className="text-sm text-zinc-100">League Settings</span>
              <span className="text-zinc-600">&rsaquo;</span>
            </Link>
          )}
        </div>
      </div>
      <BottomNav />
    </main>
  );
}
