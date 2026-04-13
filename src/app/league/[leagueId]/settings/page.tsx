import { notFound, redirect } from "next/navigation";
import { TRPCError } from "@trpc/server";

import { auth } from "~/server/auth";
import { createCaller } from "~/server/api/root";
import { db } from "~/server/db";
import { InviteLink } from "~/components/league/InviteLink";
import { CommissionerControls } from "~/components/league/CommissionerControls";
import { DraftControls } from "~/components/league/DraftControls";
import { BottomNav } from "~/components/shared/BottomNav";

interface Props {
  params: Promise<{ leagueId: string }>;
}

export default async function LeagueSettingsPage({ params }: Props) {
  const { leagueId } = await params;
  const session = await auth();
  if (!session) redirect("/sign-in");

  const caller = createCaller({ db, session, headers: new Headers() });

  let token: string | null;
  try {
    const result = await caller.league.getInviteToken({ leagueId });
    token = result.token;
  } catch (err) {
    if (err instanceof TRPCError && err.code === "FORBIDDEN") {
      return (
        <main className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-50">
          <p className="text-zinc-400">You don&apos;t have access to these settings.</p>
        </main>
      );
    }
    notFound();
  }

  // Fetch participant list for delegation UI
  let participants: { userId: string; name: string | null; email: string | null; isCommissioner: boolean }[] = [];
  try {
    const leagueData = await caller.league.getLeague({ leagueId });
    participants = leagueData.participants.map((p) => ({
      userId: p.user.id,
      name: p.user.name,
      email: p.user.email,
      isCommissioner: p.isCommissioner,
    }));
  } catch {
    // Commissioner is a member so this should not fail; fall back to empty list
  }

  return (
    <main className="min-h-screen bg-zinc-950 pb-16 text-zinc-50">
      <div className="mx-auto max-w-xl px-4 py-6">
        <h1 className="mb-6 text-2xl font-bold text-orange-500">League Settings</h1>

        <div className="mb-4 rounded-xl bg-zinc-900 p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">
            Invite Link
          </h2>
          {token ? (
            <InviteLink leagueId={leagueId} initialToken={token} />
          ) : (
            <p className="text-sm text-zinc-500">
              No invite link yet — use Regenerate to create one.
            </p>
          )}
        </div>

        <div className="mb-4 rounded-xl bg-zinc-900 p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">
            Draft Controls
          </h2>
          <p className="mb-3 text-xs text-zinc-500">
            Generate draft orders, open/close draft windows, and manage games.
          </p>
          <DraftControls leagueId={leagueId} />
        </div>

        <div className="rounded-xl bg-zinc-900 p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">
            Transfer Commissioner
          </h2>
          <CommissionerControls leagueId={leagueId} participants={participants} />
        </div>
      </div>
      <BottomNav />
    </main>
  );
}
