import { notFound, redirect } from "next/navigation";
import { TRPCError } from "@trpc/server";

import { auth } from "~/server/auth";
import { createCaller } from "~/server/api/root";
import { db } from "~/server/db";
import { BottomNav } from "~/components/shared/BottomNav";

interface Props {
  params: Promise<{ leagueId: string }>;
}

function getMethodLabel(method: string): string | null {
  if (method === "auto-preference") return "auto \u2014 preference list";
  if (method === "auto-system") return "auto \u2014 system";
  if (method === "mozgov-manual") return "Mozgov";
  if (method === "mozgov-auto-preference") return "Mozgov \u2014 auto preference";
  if (method === "mozgov-auto-system") return "Mozgov \u2014 auto system";
  return null;
}

export default async function HistoryPage({ params }: Props) {
  const { leagueId } = await params;
  const session = await auth();
  if (!session) redirect("/sign-in");

  const caller = createCaller({ db, session, headers: new Headers() });

  let data;
  try {
    data = await caller.draft.getSeriesHistory({ leagueId });
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

  const currentUserId = session.user.id;

  return (
    <main className="min-h-screen bg-zinc-950 pb-16 text-zinc-50">
      <div className="mx-auto max-w-xl px-4 py-4">
        <h1 className="mb-4 text-lg font-bold text-orange-500">
          Series Draft History
        </h1>

        {data.games.length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-500">
            No games drafted yet
          </p>
        ) : (
          <div className="space-y-6">
            {data.games.map((game) => (
              <section key={game.id}>
                <h2 className="mb-2 text-sm font-semibold text-zinc-300">
                  Game {game.gameNumber}
                  <span className="ml-2 text-xs text-zinc-600">
                    {game.status}
                  </span>
                </h2>
                {game.picks.length === 0 ? (
                  <p className="text-xs text-zinc-600">No picks yet</p>
                ) : (
                  <ul className="space-y-1">
                    {game.picks.map((pick) => {
                      const methodLabel = getMethodLabel(pick.method);
                      const isMe = pick.participantUserId === currentUserId;
                      return (
                        <li
                          key={pick.id}
                          className="flex items-center gap-3 rounded-xl bg-zinc-900 px-3 py-2.5"
                        >
                          <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-orange-500/20 text-[10px] font-bold text-orange-400">
                            #{pick.pickPosition}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-zinc-100">
                              <span
                                className={
                                  isMe
                                    ? "font-bold text-orange-400"
                                    : "font-medium"
                                }
                              >
                                {pick.participantName}
                              </span>
                              {" \u2192 "}
                              <span className="font-medium">
                                {pick.playerFirstName.charAt(0)}.{" "}
                                {pick.playerFamilyName}
                              </span>
                              <span className="ml-1 text-xs text-zinc-500">
                                {pick.playerTeamTricode}
                              </span>
                            </p>
                            {(methodLabel ?? pick.overridden) && (
                              <div className="flex items-center gap-2 text-[10px] text-zinc-500">
                                {methodLabel && (
                                  <span className="italic">{methodLabel}</span>
                                )}
                                {pick.overridden && (
                                  <span className="font-medium text-yellow-500">
                                    overridden
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            ))}
          </div>
        )}

        {data.burnedPlayers.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-3 text-sm font-semibold text-zinc-300">
              Burned Players
            </h2>
            <div className="space-y-3">
              {data.burnedPlayers.map((bp) => (
                <div key={bp.participantName}>
                  <p className="mb-1 text-xs font-medium text-zinc-400">
                    {bp.participantName}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {bp.players.map((player, i) => (
                      <span
                        key={i}
                        className="rounded bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-500"
                      >
                        {player.firstName.charAt(0)}. {player.familyName}{" "}
                        ({player.teamTricode})
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
      <BottomNav />
    </main>
  );
}
