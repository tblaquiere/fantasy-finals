import { redirect } from "next/navigation";
import Link from "next/link";

import { auth } from "~/server/auth";
import { createCaller } from "~/server/api/root";
import { db } from "~/server/db";
import { SERIES_STUBS } from "~/lib/constants";

interface Props {
  params: Promise<{ token: string }>;
}

export default async function JoinPage({ params }: Props) {
  const { token } = await params;

  // Look up league by token (public — no auth needed)
  const publicCaller = createCaller({ db, session: null, headers: new Headers() });
  const league = await publicCaller.league.getLeagueByToken({ token });

  // Invalid token
  if (!league) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-50">
        <div className="mx-auto max-w-sm px-4 text-center">
          <h1 className="mb-4 text-2xl font-bold text-orange-500">Invalid Invite Link</h1>
          <p className="text-zinc-400">
            This invite link is invalid or has expired. Ask the league commissioner for a new one.
          </p>
        </div>
      </main>
    );
  }

  // Check auth
  const session = await auth();

  if (session) {
    // Authenticated — join and redirect
    // Note: redirect() throws internally in Next.js, so keep it outside try/catch
    const authedCaller = createCaller({ db, session, headers: new Headers() });
    let joinResult: { leagueId: string } | null = null;
    try {
      joinResult = await authedCaller.league.joinLeague({ token });
    } catch {
      return (
        <main className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-50">
          <div className="mx-auto max-w-sm px-4 text-center">
            <h1 className="mb-4 text-2xl font-bold text-orange-500">Something went wrong</h1>
            <p className="text-zinc-400">
              We couldn&apos;t add you to this league. Please try again or ask the commissioner for a new invite link.
            </p>
          </div>
        </main>
      );
    }
    redirect(`/league/${joinResult.leagueId}`);
  }

  // Not authenticated — show league preview with sign-in CTA
  const series = SERIES_STUBS.find((s) => s.id === league.seriesId);

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 pb-16 text-zinc-50">
      <div className="mx-auto max-w-sm px-4 text-center">
        <h1 className="mb-2 text-2xl font-bold text-orange-500">{league.name}</h1>
        <p className="mb-1 text-sm text-zinc-400">{series?.name ?? league.seriesId}</p>
        <p className="mb-6 text-sm text-zinc-500">
          {league.participantCount} participant{league.participantCount !== 1 ? "s" : ""}
        </p>
        <p className="mb-6 text-zinc-300">You&apos;ve been invited to join this league!</p>
        <Link
          href={`/sign-in?callbackUrl=${encodeURIComponent(`/join/${token}`)}`}
          className="inline-block rounded-lg bg-orange-500 px-6 py-3 font-semibold text-white hover:bg-orange-600"
        >
          Sign in to join
        </Link>
      </div>
    </main>
  );
}
