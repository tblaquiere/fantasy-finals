import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "~/server/auth";
import { createCaller } from "~/server/api/root";
import { db } from "~/server/db";
import { SERIES_STUBS } from "~/lib/constants";
import { EmptyDashboard } from "~/components/league/EmptyDashboard";
import { BottomNav } from "~/components/shared/BottomNav";
import { PushPermissionPrompt } from "~/components/shared/PushPermissionPrompt";
import { DraftFeed } from "~/components/draft/DraftFeed";

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect("/sign-in");

  const caller = createCaller({ db, session, headers: new Headers() });
  const leagues = await caller.league.getMyLeagues();

  // Find the first league with an active draft or game
  let activeGame: {
    gameId: string;
    gameNumber: number;
    status: string;
    leagueId: string;
    leagueName: string;
    seriesName: string;
  } | null = null;
  let isMyTurn = false;

  for (const league of leagues) {
    const game = await db.game.findFirst({
      where: {
        leagueId: league.leagueId,
        status: { in: ["draft-open", "active"] },
      },
      orderBy: { gameNumber: "asc" },
      select: { id: true, gameNumber: true, status: true },
    });

    if (game) {
      const seriesName =
        SERIES_STUBS.find((s) => s.id === league.seriesId)?.name ??
        league.seriesId;
      activeGame = {
        gameId: game.id,
        gameNumber: game.gameNumber,
        status: game.status,
        leagueId: league.leagueId,
        leagueName: league.leagueName,
        seriesName,
      };

      // Check if it's the current user's turn
      if (game.status === "draft-open") {
        const myParticipant = await db.participant.findUnique({
          where: {
            userId_leagueId: {
              userId: session.user.id,
              leagueId: league.leagueId,
            },
          },
        });
        if (myParticipant) {
          const activeSlot = await db.draftSlot.findFirst({
            where: {
              gameId: game.id,
              participantId: myParticipant.id,
              clockExpiresAt: { gt: new Date() },
            },
          });
          if (activeSlot) {
            isMyTurn = true;
          }
        }
      }

      break;
    }
  }

  // Auto-redirect to pick page if it's my turn
  if (isMyTurn && activeGame) {
    redirect(
      `/draft/${activeGame.gameId}/pick?leagueId=${activeGame.leagueId}`,
    );
  }

  return (
    <main className="min-h-screen bg-zinc-950 pb-16 text-zinc-50">
      <div className="mx-auto max-w-xl px-4 py-6">
        {activeGame ? (
          <>
            {/* Active game header */}
            <div className="mb-1 flex items-center justify-between">
              <h1 className="text-lg font-bold text-orange-500">
                Game {activeGame.gameNumber}
              </h1>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  activeGame.status === "draft-open"
                    ? "bg-green-500/20 text-green-400"
                    : "bg-blue-500/20 text-blue-400"
                }`}
              >
                {activeGame.status === "draft-open"
                  ? "Draft Open"
                  : activeGame.status}
              </span>
            </div>
            <p className="mb-4 text-xs text-zinc-500">
              {activeGame.leagueName} — {activeGame.seriesName}
            </p>

            {/* Draft feed — the main content */}
            {activeGame.status === "draft-open" && (
              <DraftFeed
                gameId={activeGame.gameId}
                leagueId={activeGame.leagueId}
              />
            )}

            {/* Preference list link */}
            <div className="mt-4">
              <Link
                href={`/league/${activeGame.leagueId}/preferences`}
                className="text-sm text-zinc-400 underline hover:text-zinc-200"
              >
                Set Preferences
              </Link>
            </div>
          </>
        ) : (
          <>
            <h1 className="mb-1 text-2xl font-bold text-orange-500">
              Fantasy Finals
            </h1>
            <p className="mb-6 text-sm text-zinc-400">{session.user.email}</p>

            {leagues.length === 0 ? (
              <EmptyDashboard />
            ) : (
              <div className="space-y-3">
                <p className="mb-2 text-sm text-zinc-400">
                  No active drafts or games right now.
                </p>
                {leagues.map((league) => {
                  const seriesName =
                    SERIES_STUBS.find((s) => s.id === league.seriesId)?.name ??
                    league.seriesId;
                  return (
                    <Link
                      key={league.leagueId}
                      href={`/league/${league.leagueId}`}
                      className="block rounded-xl bg-zinc-900 px-4 py-3 hover:bg-zinc-800"
                    >
                      <p className="text-sm font-medium text-zinc-100">
                        {league.leagueName}
                      </p>
                      <p className="mt-0.5 text-xs text-zinc-500">
                        {seriesName}
                      </p>
                    </Link>
                  );
                })}
              </div>
            )}
          </>
        )}

        <PushPermissionPrompt />
      </div>
      <BottomNav isAdmin={session.user.role === "admin"} />
    </main>
  );
}
