import { db } from "~/server/db";

interface Props {
  leagueId: string;
  currentUserId: string;
}

/**
 * Story 7.2: Visible to all participants — the upcoming game's pick order.
 * Shows the next non-final game's draft order with the current user's
 * position highlighted. Renders nothing if no upcoming order is published.
 */
export async function NextDraftOrder({ leagueId, currentUserId }: Props) {
  const nextGame = await db.game.findFirst({
    where: { leagueId, status: { in: ["pending", "draft-open"] } },
    orderBy: { gameNumber: "asc" },
    select: { id: true, gameNumber: true, status: true, draftOrderProvisional: true },
  });

  if (!nextGame) return null;

  const slots = await db.draftSlot.findMany({
    where: { gameId: nextGame.id },
    orderBy: { pickPosition: "asc" },
    include: {
      participant: {
        include: { user: { select: { id: true, name: true, email: true } } },
      },
    },
  });

  if (slots.length === 0) return null;

  const myPosition = slots.find((s) => s.participant.user.id === currentUserId)?.pickPosition;

  return (
    <section className="mt-6">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-400">
        Next Draft — Game {nextGame.gameNumber}
        {nextGame.draftOrderProvisional && (
          <span className="ml-2 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-medium normal-case text-amber-300">
            Provisional
          </span>
        )}
      </h2>
      {nextGame.draftOrderProvisional && (
        <p className="mb-3 text-xs text-zinc-500">
          Order may shift if NBA stat corrections land within 24 hours of the previous game&apos;s
          final buzzer. You&apos;ll be notified if your pick position changes.
        </p>
      )}
      {myPosition && (
        <p className="mb-3 rounded-xl bg-orange-500/10 px-4 py-3 text-sm text-orange-300">
          You pick <span className="font-bold text-orange-400">#{myPosition}</span> of{" "}
          {slots.length}
        </p>
      )}
      <ol className="space-y-2">
        {slots.map((slot) => {
          const isMe = slot.participant.user.id === currentUserId;
          return (
            <li
              key={slot.id}
              className={`flex items-center gap-3 rounded-xl px-4 py-3 ${
                isMe ? "bg-orange-500/10 ring-1 ring-orange-500/40" : "bg-zinc-900"
              }`}
            >
              <span
                className={`min-w-[2rem] text-sm font-bold ${
                  isMe ? "text-orange-400" : "text-zinc-500"
                }`}
              >
                #{slot.pickPosition}
              </span>
              <span className={isMe ? "text-orange-100" : "text-zinc-100"}>
                {slot.participant.user.name ?? slot.participant.user.email ?? "Unknown"}
                {isMe && <span className="ml-2 text-xs text-orange-400">(you)</span>}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
