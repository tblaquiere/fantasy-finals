"use client";

import { useState, useCallback, useEffect } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { toast } from "sonner";
import { cn } from "~/lib/utils";
import { api } from "~/trpc/react";

interface PreferencePlayer {
  id: string;
  rank: number;
  nbaPlayerId: number;
  firstName: string;
  familyName: string;
  teamTricode: string;
  position: string;
}

interface EligiblePlayer {
  nbaPlayerId: number;
  firstName: string;
  familyName: string;
  teamTricode: string;
  position: string;
  isUsed: boolean;
}

interface PreferenceListProps {
  leagueId: string;
  gameId?: string;
}

function SortableItem({
  player,
  onRemove,
}: {
  player: PreferencePlayer;
  onRemove: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: player.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-3 rounded-xl bg-zinc-900 px-3 py-3",
        isDragging && "z-10 opacity-80 shadow-lg shadow-zinc-950",
      )}
    >
      <button
        type="button"
        className="flex h-8 w-8 flex-shrink-0 cursor-grab items-center justify-center rounded text-zinc-500 hover:text-zinc-300 active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="5" cy="3" r="1.5" />
          <circle cx="11" cy="3" r="1.5" />
          <circle cx="5" cy="8" r="1.5" />
          <circle cx="11" cy="8" r="1.5" />
          <circle cx="5" cy="13" r="1.5" />
          <circle cx="11" cy="13" r="1.5" />
        </svg>
      </button>
      <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-orange-500/20 text-xs font-bold text-orange-400">
        {player.rank}
      </span>
      <div className="flex-1 min-w-0">
        <span className="truncate text-sm font-medium text-zinc-100">
          {player.firstName.charAt(0)}. {player.familyName}
        </span>
        <span className="ml-2 text-xs text-zinc-500">
          {player.teamTricode} &middot; {player.position}
        </span>
      </div>
      <button
        type="button"
        onClick={() => onRemove(player.id)}
        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded text-zinc-600 hover:text-red-400"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="2" y1="2" x2="12" y2="12" />
          <line x1="12" y1="2" x2="2" y2="12" />
        </svg>
      </button>
    </div>
  );
}

function AddPlayerModal({
  eligible,
  onAdd,
  onClose,
}: {
  eligible: EligiblePlayer[];
  onAdd: (player: EligiblePlayer) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = eligible.filter((p) => {
    const q = search.toLowerCase();
    return (
      p.firstName.toLowerCase().includes(q) ||
      p.familyName.toLowerCase().includes(q) ||
      p.teamTricode.toLowerCase().includes(q)
    );
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center">
      <div className="w-full max-w-xl rounded-t-2xl bg-zinc-900 p-4 sm:rounded-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-zinc-100">Add Player</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-zinc-500 hover:text-zinc-300"
          >
            Close
          </button>
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search players..."
          className="mb-3 w-full rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none focus:ring-1 focus:ring-orange-500"
        />
        <ul className="max-h-80 space-y-1 overflow-y-auto">
          {filtered.map((player) => (
            <li key={player.nbaPlayerId}>
              <button
                type="button"
                disabled={player.isUsed}
                onClick={() => {
                  onAdd(player);
                  onClose();
                }}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm",
                  player.isUsed
                    ? "cursor-not-allowed opacity-40"
                    : "hover:bg-zinc-800",
                )}
              >
                <span className="font-medium text-zinc-100">
                  {player.firstName.charAt(0)}. {player.familyName}
                </span>
                <span className="text-xs text-zinc-500">
                  {player.teamTricode} &middot; {player.position}
                </span>
                {player.isUsed && (
                  <span className="ml-auto text-[10px] text-zinc-500">
                    Already used
                  </span>
                )}
              </button>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="py-4 text-center text-sm text-zinc-500">
              No players found
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}

export function PreferenceList({ leagueId, gameId }: PreferenceListProps) {
  const utils = api.useUtils();
  const [showAdd, setShowAdd] = useState(false);
  const [items, setItems] = useState<PreferencePlayer[] | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  // Fetch current preference list
  const { data: prefData, isLoading } = api.draft.getPreferenceList.useQuery(
    { leagueId },
  );

  useEffect(() => {
    if (prefData && !isDirty) setItems(prefData);
  }, [prefData, isDirty]);

  // Fetch eligible players for the add modal
  // When gameId is available, use the live eligible players query;
  // otherwise fall back to the series roster (always available)
  const eligibleQuery = api.draft.getEligiblePlayers.useQuery(
    { leagueId, gameId: gameId! },
    { enabled: showAdd && !!gameId },
  );
  const rosterQuery = api.standing.getSeriesRoster.useQuery(
    { leagueId },
    { enabled: showAdd && !gameId },
  );

  const saveMutation = api.draft.savePreferenceList.useMutation({
    onSuccess: () => {
      setIsDirty(false);
      void utils.draft.getPreferenceList.invalidate();
      toast.success("Preference list saved");
    },
    onError: (err) => toast.error(err.message),
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || !items || active.id === over.id) return;

      const oldIndex = items.findIndex((i) => i.id === active.id);
      const newIndex = items.findIndex((i) => i.id === over.id);
      const reordered = arrayMove(items, oldIndex, newIndex).map(
        (item, idx) => ({ ...item, rank: idx + 1 }),
      );
      setItems(reordered);
      setIsDirty(true);
    },
    [items],
  );

  const handleRemove = useCallback(
    (id: string) => {
      if (!items) return;
      const updated = items
        .filter((i) => i.id !== id)
        .map((item, idx) => ({ ...item, rank: idx + 1 }));
      setItems(updated);
      setIsDirty(true);
    },
    [items],
  );

  const handleAdd = useCallback(
    (player: EligiblePlayer) => {
      if (!items) return;
      // Don't add if already in list
      if (items.some((i) => i.nbaPlayerId === player.nbaPlayerId)) {
        toast.error("Player already in your preference list");
        return;
      }
      const newItem: PreferencePlayer = {
        id: `temp-${player.nbaPlayerId}`,
        rank: items.length + 1,
        nbaPlayerId: player.nbaPlayerId,
        firstName: player.firstName,
        familyName: player.familyName,
        teamTricode: player.teamTricode,
        position: player.position,
      };
      setItems([...items, newItem]);
      setIsDirty(true);
    },
    [items],
  );

  const handleSave = useCallback(() => {
    if (!items) return;
    saveMutation.mutate({
      leagueId,
      playerIds: items.map((i) => i.nbaPlayerId),
    });
  }, [items, leagueId, saveMutation]);

  if (isLoading || !items) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-xl bg-zinc-900" />
        ))}
      </div>
    );
  }

  // Build eligible players list for add modal, filtering out already-in-list
  const inListIds = new Set(items.map((i) => i.nbaPlayerId));
  const eligiblePlayers: EligiblePlayer[] = gameId
    ? (eligibleQuery.data?.players
        .filter((p) => !inListIds.has(p.nbaPlayerId))
        .map((p) => ({
          nbaPlayerId: p.nbaPlayerId,
          firstName: p.firstName,
          familyName: p.familyName,
          teamTricode: p.teamTricode,
          position: p.position ?? "",
          isUsed: p.isUsed,
        })) ?? [])
    : (rosterQuery.data?.players
        .filter((p) => !inListIds.has(p.nbaPlayerId))
        .map((p) => ({
          nbaPlayerId: p.nbaPlayerId,
          firstName: p.firstName,
          familyName: p.familyName,
          teamTricode: p.teamTricode,
          position: p.position,
          isUsed: p.pickedByMe,
        })) ?? []);

  return (
    <div className="space-y-3">
      {items.length === 0 ? (
        <p className="py-8 text-center text-sm text-zinc-500">
          No players in your preference list yet. Add some below.
        </p>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={items.map((i) => i.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="space-y-1">
              {items.map((player) => (
                <li key={player.id}>
                  <SortableItem player={player} onRemove={handleRemove} />
                </li>
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="flex-1 min-h-[44px] rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800"
        >
          + Add Player
        </button>
        {isDirty && (
          <button
            type="button"
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className="flex-1 min-h-[44px] rounded-lg bg-orange-500 px-4 py-2 text-sm font-bold text-zinc-950 hover:bg-orange-400 disabled:opacity-50"
          >
            {saveMutation.isPending ? "Saving..." : "Save List"}
          </button>
        )}
      </div>

      {showAdd && (
        <AddPlayerModal
          eligible={eligiblePlayers}
          onAdd={handleAdd}
          onClose={() => setShowAdd(false)}
        />
      )}
    </div>
  );
}
