"use client";

import { useState } from "react";
import { toast } from "sonner";

import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { DRAFT_TIPOFF_BUFFER_MINUTES } from "~/lib/constants";

// Mirror of the server-side rule in draft-open-schedule.ts. Kept local
// because client bundles must not import server-only modules.
function minLegalOffsetMinutes(participantCount: number, clockDurationMinutes: number) {
  return participantCount * clockDurationMinutes + DRAFT_TIPOFF_BUFFER_MINUTES;
}

interface Props {
  leagueId: string;
  initialOffsetMinutes: number;
  participantCount: number;
  clockDurationMinutes: number;
}

export function DraftScheduleSettings({
  leagueId,
  initialOffsetMinutes,
  participantCount,
  clockDurationMinutes,
}: Props) {
  const [value, setValue] = useState<string>(String(initialOffsetMinutes));
  const utils = api.useUtils();

  const update = api.league.updateDraftOpenOffset.useMutation({
    onSuccess: async () => {
      toast.success("Draft schedule updated");
      await utils.league.getLeague.invalidate({ leagueId });
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const minLegal = minLegalOffsetMinutes(participantCount, clockDurationMinutes);
  const parsed = Number(value);
  const isValid = Number.isFinite(parsed) && parsed >= minLegal;
  const localErrorMessage =
    Number.isFinite(parsed) && parsed < minLegal
      ? `With ${participantCount} participants × ${clockDurationMinutes}-min clocks + ${DRAFT_TIPOFF_BUFFER_MINUTES}-min buffer, ` +
        `set the offset to at least ${minLegal} minutes before tipoff.`
      : null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!Number.isFinite(parsed)) return;
    update.mutate({ leagueId, draftOpenOffsetMinutes: parsed });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="draft-offset" className="text-zinc-300">
          Open draft (minutes before tipoff)
        </Label>
        <Input
          id="draft-offset"
          type="number"
          min={1}
          step={1}
          inputMode="numeric"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="border-zinc-700 bg-zinc-800 text-white placeholder:text-zinc-500"
        />
        <p className="text-xs text-zinc-500">
          Minimum {minLegal} min — {participantCount} participant
          {participantCount === 1 ? "" : "s"} × {clockDurationMinutes}-min clock + 15-min buffer.
        </p>
        {localErrorMessage && (
          <p className="text-xs text-red-400">{localErrorMessage}</p>
        )}
      </div>
      <Button
        type="submit"
        disabled={!isValid || update.isPending || parsed === initialOffsetMinutes}
        className="bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50"
      >
        {update.isPending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
