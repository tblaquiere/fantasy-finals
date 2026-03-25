import { notFound, redirect } from "next/navigation";

import { auth } from "~/server/auth";
import { DraftFeed } from "~/components/draft/DraftFeed";
import { BottomNav } from "~/components/shared/BottomNav";

interface Props {
  params: Promise<{ gameId: string }>;
  searchParams: Promise<{ leagueId?: string }>;
}

export default async function DraftFeedPage({ params, searchParams }: Props) {
  const { gameId } = await params;
  const { leagueId } = await searchParams;
  const session = await auth();
  if (!session) redirect("/sign-in");
  if (!leagueId) notFound();

  return (
    <main className="min-h-screen bg-zinc-950 pb-16 text-zinc-50">
      <div className="mx-auto max-w-xl px-4 py-4">
        <h1 className="mb-4 text-lg font-bold text-orange-500">Draft Feed</h1>
        <DraftFeed gameId={gameId} leagueId={leagueId} />
      </div>
      <BottomNav />
    </main>
  );
}
