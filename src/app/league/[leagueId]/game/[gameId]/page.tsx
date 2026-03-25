import { redirect } from "next/navigation";

import { auth } from "~/server/auth";
import { BottomNav } from "~/components/shared/BottomNav";
import { LiveScoreBoard } from "~/components/game/LiveScoreBoard";

interface Props {
  params: Promise<{ leagueId: string; gameId: string }>;
}

export default async function LiveScoresPage({ params }: Props) {
  const { gameId } = await params;
  const session = await auth();
  if (!session) redirect("/sign-in");

  return (
    <main className="min-h-screen bg-zinc-950 pb-16 text-zinc-50">
      <div className="mx-auto max-w-xl px-4 py-4">
        <h1 className="mb-4 text-lg font-bold text-orange-500">
          Live Scores
        </h1>
        <LiveScoreBoard gameId={gameId} />
      </div>
      <BottomNav />
    </main>
  );
}
