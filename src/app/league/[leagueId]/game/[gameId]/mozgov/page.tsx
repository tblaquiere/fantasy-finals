import { redirect } from "next/navigation";

import { auth } from "~/server/auth";
import { BottomNav } from "~/components/shared/BottomNav";
import { MozgovWindow } from "~/components/game/MozgovWindow";

interface Props {
  params: Promise<{ leagueId: string; gameId: string }>;
}

export default async function MozgovPage({ params }: Props) {
  const { leagueId, gameId } = await params;
  const session = await auth();
  if (!session) redirect("/sign-in");

  return (
    <main className="min-h-screen bg-zinc-950 pb-16 text-zinc-50">
      <div className="mx-auto max-w-xl px-4 py-4">
        <h1 className="mb-1 text-lg font-bold text-red-500">
          Mozgov Rule
        </h1>
        <p className="mb-4 text-xs text-zinc-500">
          Replace your benched player — full game credit
        </p>
        <MozgovWindow gameId={gameId} leagueId={leagueId} />
      </div>
      <BottomNav />
    </main>
  );
}
