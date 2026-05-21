"use client";

import { useState } from "react";
import { toast } from "sonner";

import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { DRAFT_TIPOFF_BUFFER_MINUTES } from "~/lib/constants";

interface Props {
  leagueId: string;
  gameId: string;
  initialOverrideMinutes: number | null;
  leagueDefaultMinutes: number;
  tipoffISO: string | null; // NbaGame.gameDate as ISO string, null if unknown
  participantCount: number;
  clockDurationMinutes: number;
}

function minLegalOffsetMinutes(participants: number, clock: number) {
  return participants * clock + DRAFT_TIPOFF_BUFFER_MINUTES;
}

function formatPreview(tipoffISO: string | null, offsetMinutes: number): string {
  if (!tipoffISO) return "Tipoff not yet scheduled";
  const tipoff = new Date(tipoffISO);
  const open = new Date(tipoff.getTime() - offsetMinutes * 60_000);
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(open);
}

export function GameDraftScheduleEditor({
  leagueId,
  gameId,
  initialOverrideMinutes,
  leagueDefaultMinutes,
  tipoffISO,
  participantCount,
  clockDurationMinutes,
}: Props) {
  // null = inherit (no override). Stored as string in the input.
  const [hasOverride, setHasOverride] = useState(initialOverrideMinutes !== null);
  const [overrideValue, setOverrideValue] = useState<string>(
    String(initialOverrideMinutes ?? leagueDefaultMinutes),
  );
  const utils = api.useUtils();

  const update = api.draft.updateGameDraftOffset.useMutation({
    onSuccess: async () => {
      toast.success("Schedule updated");
      await utils.league.getLeague.invalidate({ leagueId });
    },
    onError: (err) => toast.error(err.message),
  });

  const parsed = Number(overrideValue);
  const minLegal = minLegalOffsetMinutes(participantCount, clockDurationMinutes);
  const effective = hasOverride && Number.isFinite(parsed) ? parsed : leagueDefaultMinutes;
  const isValid = effective >= minLegal;
  const errorMessage =
    !isValid
      ? `With ${participantCount} participants × ${clockDurationMinutes}-min clocks + ${DRAFT_TIPOFF_BUFFER_MINUTES}-min buffer, ` +
        `set the offset to at least ${minLegal} minutes before tipoff.`
      : null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    update.mutate({
      leagueId,
      gameId,
      draftOpenOffsetMinutes: hasOverride ? parsed : null,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex items-center gap-2">
        <input
          id="override-toggle"
          type="checkbox"
          checked={hasOverride}
          onChange={(e) => setHasOverride(e.target.checked)}
          className="h-4 w-4 accent-orange-500"
        />
        <Label htmlFor="override-toggle" className="cursor-pointer text-zinc-300">
          Override the league default for this game
        </Label>
      </div>

      <div className="space-y-2">
        <Label htmlFor="game-offset" className="text-zinc-300">
          Minutes before tipoff
        </Label>
        <Input
          id="game-offset"
          type="number"
          min={1}
          step={1}
          inputMode="numeric"
          value={overrideValue}
          onChange={(e) => setOverrideValue(e.target.value)}
          disabled={!hasOverride}
          className="border-zinc-700 bg-zinc-800 text-white placeholder:text-zinc-500 disabled:opacity-50"
        />
        <p className="text-xs text-zinc-500">
          Minimum {minLegal} min — {participantCount} participant
          {participantCount === 1 ? "" : "s"} × {clockDurationMinutes}-min clock + 15-min buffer.
          {!hasOverride && ` (inheriting league default: ${leagueDefaultMinutes} min)`}
        </p>
        <p className="text-xs text-zinc-400">
          <span className="text-zinc-500">Preview:</span>{" "}
          Draft opens {formatPreview(tipoffISO, effective)}
        </p>
        {errorMessage && (
          <p className="text-xs text-red-400">{errorMessage}</p>
        )}
      </div>

      <Button
        type="submit"
        disabled={!isValid || update.isPending}
        className="bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50"
      >
        {update.isPending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
