import Link from "next/link";

interface LeagueCardProps {
  leagueId: string;
  leagueName: string;
  seriesName: string;
  participantCount: number;
  isCommissioner: boolean;
  needsAttention?: boolean;
}

export function LeagueCard({
  leagueId,
  leagueName,
  seriesName,
  participantCount,
  isCommissioner,
  needsAttention = false,
}: LeagueCardProps) {
  return (
    <Link
      href={`/league/${leagueId}`}
      className="block rounded-xl bg-zinc-900 px-4 py-4 transition-colors hover:bg-zinc-800"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="font-semibold text-zinc-100">{leagueName}</p>
          <p className="mt-0.5 text-sm text-zinc-400">{seriesName}</p>
          <p className="mt-1 text-xs text-zinc-500">
            {participantCount} participant{participantCount !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {isCommissioner && (
            <span className="rounded-full bg-orange-500/20 px-2 py-0.5 text-xs font-medium text-orange-400">
              Commissioner
            </span>
          )}
          {needsAttention && (
            <span className="rounded-full bg-green-500/20 px-2 py-0.5 text-xs font-medium text-green-400">
              Your turn
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
