import { notFound, redirect } from "next/navigation";

import { auth } from "~/server/auth";
import { PreferenceList } from "~/components/draft/PreferenceList";
import { BottomNav } from "~/components/shared/BottomNav";

interface Props {
  params: Promise<{ gameId: string }>;
  searchParams: Promise<{ leagueId?: string }>;
}

export default async function PreferencesPage({ params, searchParams }: Props) {
  const { gameId } = await params;
  const { leagueId } = await searchParams;
  const session = await auth();
  if (!session) redirect("/sign-in");
  if (!leagueId) notFound();

  return (
    <main className="min-h-screen bg-zinc-950 pb-16 text-zinc-50">
      <div className="mx-auto max-w-xl px-4 py-4">
        <div className="mb-4">
          <h1 className="text-lg font-bold text-orange-500">Preference List</h1>
          <p className="text-xs text-zinc-500">
            Rank players in your preferred order. If your clock expires, the
            system picks the highest-ranked eligible player automatically.
          </p>
        </div>
        <PreferenceList leagueId={leagueId} gameId={gameId} />
      </div>
      <BottomNav />
    </main>
  );
}
