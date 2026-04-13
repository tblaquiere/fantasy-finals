import { redirect } from "next/navigation";

import { auth } from "~/server/auth";
import { BottomNav } from "~/components/shared/BottomNav";
import { SeriesRoster } from "~/components/standings/SeriesRoster";

interface Props {
  params: Promise<{ leagueId: string }>;
}

export default async function RosterPage({ params }: Props) {
  const { leagueId } = await params;
  const session = await auth();
  if (!session) redirect("/sign-in");

  return (
    <main className="min-h-screen bg-zinc-950 pb-16 text-zinc-50">
      <div className="mx-auto max-w-xl px-4 py-4">
        <h1 className="mb-1 text-lg font-bold text-orange-500">
          Series Roster
        </h1>
        <p className="mb-4 text-xs text-zinc-500">
          All players in the series. Your picks are highlighted.
        </p>
        <SeriesRoster leagueId={leagueId} />
      </div>
      <BottomNav />
    </main>
  );
}
