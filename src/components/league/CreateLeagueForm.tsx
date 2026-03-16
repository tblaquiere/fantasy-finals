"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { api } from "~/trpc/react";
import { SERIES_STUBS, CLOCK_DURATION_OPTIONS } from "~/lib/constants";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";

export function CreateLeagueForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [seriesId, setSeriesId] = useState("");
  const [clockDurationMinutes, setClockDurationMinutes] = useState<number>(30);
  const [error, setError] = useState<string | null>(null);

  const createLeague = api.league.createLeague.useMutation({
    onSuccess: ({ leagueId }) => {
      router.push(`/league/${leagueId}`);
    },
    onError: (err) => {
      setError(err.message ?? "Failed to create league. Please try again.");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!seriesId) {
      setError("Please select a playoff series.");
      return;
    }
    createLeague.mutate({ name, seriesId, clockDurationMinutes });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="league-name" className="text-zinc-300">
          League Name
        </Label>
        <Input
          id="league-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My League"
          required
          maxLength={60}
          className="border-zinc-700 bg-zinc-800 text-white placeholder:text-zinc-500"
        />
      </div>

      <div className="space-y-2">
        <Label className="text-zinc-300">Playoff Series</Label>
        <Select onValueChange={setSeriesId} value={seriesId}>
          <SelectTrigger className="border-zinc-700 bg-zinc-800 text-white">
            <SelectValue placeholder="Select a series" />
          </SelectTrigger>
          <SelectContent className="border-zinc-700 bg-zinc-900">
            {SERIES_STUBS.map((series) => (
              <SelectItem
                key={series.id}
                value={series.id}
                className="text-zinc-100 focus:bg-zinc-700"
              >
                {series.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label className="text-zinc-300">Selection Clock</Label>
        <Select
          onValueChange={(v) => setClockDurationMinutes(Number(v))}
          value={String(clockDurationMinutes)}
        >
          <SelectTrigger className="border-zinc-700 bg-zinc-800 text-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="border-zinc-700 bg-zinc-900">
            {CLOCK_DURATION_OPTIONS.map((minutes) => (
              <SelectItem
                key={minutes}
                value={String(minutes)}
                className="text-zinc-100 focus:bg-zinc-700"
              >
                {minutes} minutes
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <Button
        type="submit"
        disabled={createLeague.isPending}
        className="w-full bg-orange-500 py-3 font-bold text-white hover:bg-orange-600 disabled:opacity-50"
      >
        {createLeague.isPending ? "Creating…" : "Create League"}
      </Button>
    </form>
  );
}
