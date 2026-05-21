import { redirect } from "next/navigation";

import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { BottomNav } from "~/components/shared/BottomNav";
import { LiveScoreBoard } from "~/components/game/LiveScoreBoard";
import { GameDraftScheduleEditor } from "~/components/league/GameDraftScheduleEditor";
import { NextDraftCountdown } from "~/components/league/NextDraftCountdown";

interface Props {
  params: Promise<{ leagueId: string; gameId: string }>;
}

export default async function LiveScoresPage({ params }: Props) {
  const { leagueId, gameId } = await params;
  const session = await auth();
  if (!session) redirect("/sign-in");

  // Surface the per-game draft schedule editor for the commissioner only.
  // Other participants just see the live score board.
  const game = await db.game.findFirst({
    where: { id: gameId, leagueId },
    include: {
      league: {
        select: {
          draftOpenOffsetMinutes: true,
          clockDurationMinutes: true,
          _count: { select: { participants: true } },
        },
      },
    },
  });

  let tipoffISO: string | null = null;
  if (game) {
    const nbaGame = await db.nbaGame.findUnique({
      where: { nbaGameId: game.nbaGameId },
      select: { gameDate: true },
    });
    tipoffISO = nbaGame?.gameDate.toISOString() ?? null;
  }

  const myParticipant = await db.participant.findUnique({
    where: { userId_leagueId: { userId: session.user.id, leagueId } },
    select: { isCommissioner: true },
  });
  const isCommissioner =
    (myParticipant?.isCommissioner ?? false) || session.user.role === "admin";

  return (
    <main className="min-h-screen bg-zinc-950 pb-16 text-zinc-50">
      <div className="mx-auto max-w-xl px-4 py-4">
        <h1 className="mb-4 text-lg font-bold text-orange-500">
          Live Scores
        </h1>
        <LiveScoreBoard gameId={gameId} />

        {isCommissioner && game && game.status === "pending" && (
          <div className="mt-6 rounded-xl bg-zinc-900 p-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">
              Auto-Open Schedule
            </h2>
            {game.draftOpensAt && (
              <div className="mb-3 flex items-center justify-between rounded-lg bg-zinc-800/50 px-3 py-2">
                <span className="text-xs text-zinc-400">Currently scheduled:</span>
                <NextDraftCountdown draftOpensAt={game.draftOpensAt} />
              </div>
            )}
            <GameDraftScheduleEditor
              leagueId={leagueId}
              gameId={gameId}
              initialOverrideMinutes={game.draftOpenOffsetMinutes}
              leagueDefaultMinutes={game.league.draftOpenOffsetMinutes}
              tipoffISO={tipoffISO}
              participantCount={game.league._count.participants}
              clockDurationMinutes={game.league.clockDurationMinutes}
            />
          </div>
        )}
      </div>
      <BottomNav />
    </main>
  );
}
