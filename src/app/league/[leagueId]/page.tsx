import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { TRPCError } from "@trpc/server";

import { auth } from "~/server/auth";
import { createCaller } from "~/server/api/root";
import { db } from "~/server/db";
import { SERIES_STUBS } from "~/lib/constants";
import { BottomNav } from "~/components/shared/BottomNav";

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

  // Find the active draft or next pending game for quick-access links
  const nextGame = await db.game.findFirst({
    where: {
      leagueId: league.id,
      status: { in: ["pending", "draft-open"] },
    },
    orderBy: { gameNumber: "asc" },
    select: { id: true, gameNumber: true, status: true },
  });

  // If a draft is open, check if it's the current user's turn
  let isMyTurn = false;
  if (nextGame?.status === "draft-open") {
    const myParticipant = await db.participant.findUnique({
      where: { userId_leagueId: { userId: session.user.id, leagueId: league.id } },
    });
    if (myParticipant) {
      const activeSlot = await db.draftSlot.findFirst({
        where: {
          gameId: nextGame.id,
          participantId: myParticipant.id,
          clockExpiresAt: { gt: new Date() },
        },
      });
      if (activeSlot) {
        isMyTurn = true;
      }
    }
  }

  // Auto-redirect to pick page if it's my turn
  if (isMyTurn && nextGame) {
    redirect(`/draft/${nextGame.id}/pick?leagueId=${league.id}`);
  }

  return (
    <main className="min-h-screen bg-zinc-950 pb-16 text-zinc-50">
      <div className="mx-auto max-w-xl px-4 py-6">
        <h1 className="mb-1 text-2xl font-bold text-orange-500">{league.name}</h1>
        <p className="mb-4 text-sm text-zinc-400">{series?.name ?? league.seriesId}</p>
        <p className="mb-6 text-sm text-zinc-400">
          Selection clock: {league.clockDurationMinutes} min
        </p>

        <h2 className="mb-3 text-lg font-semibold text-zinc-100">Participants</h2>
        <ul className="space-y-2">
          {league.participants.map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-3 rounded-xl bg-zinc-900 px-4 py-3"
            >
              <span className="text-zinc-100">{p.user.name ?? p.user.email}</span>
              {p.isCommissioner && (
                <span className="rounded-full bg-orange-500/20 px-2 py-0.5 text-xs font-medium text-orange-400">
                  Commissioner
                </span>
              )}
            </li>
          ))}
        </ul>

        {nextGame && (
          <div className="mt-6 rounded-xl bg-zinc-900 p-4">
            <h2 className="mb-2 text-sm font-semibold text-zinc-300">
              Game {nextGame.gameNumber}
              <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${
                nextGame.status === "draft-open"
                  ? "bg-green-500/20 text-green-400"
                  : "bg-orange-500/20 text-orange-400"
              }`}>
                {nextGame.status === "draft-open" ? "Draft Open" : nextGame.status}
              </span>
            </h2>
            <div className="flex flex-wrap gap-3">
              <Link
                href={`/draft/${nextGame.id}?leagueId=${league.id}`}
                className="text-sm text-orange-400 underline hover:text-orange-300"
              >
                Draft Feed
              </Link>
              <Link
                href={`/draft/${nextGame.id}/pick?leagueId=${league.id}`}
                className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-orange-400"
              >
                Pick a Player
              </Link>
            </div>
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-4">
          <Link
            href={`/league/${league.id}/preferences`}
            className="text-sm text-zinc-400 underline hover:text-zinc-200"
          >
            Set Preferences
          </Link>
          <Link
            href={`/league/${league.id}/roster`}
            className="text-sm text-zinc-400 underline hover:text-zinc-200"
          >
            Series Roster
          </Link>
          {league.participants.some(
            (p) => p.isCommissioner && p.user.id === session.user.id
          ) && (
            <Link
              href={`/league/${league.id}/settings`}
              className="text-sm text-zinc-400 underline hover:text-zinc-200"
            >
              League Settings
            </Link>
          )}
        </div>
      </div>
      <BottomNav />
    </main>
  );
}
