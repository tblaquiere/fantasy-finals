"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  draftOpensAt: Date | string;
  /** Optional class for the wrapper. */
  className?: string;
}

function formatCountdown(remainingMs: number): string {
  if (remainingMs <= 0) return "Draft is opening shortly…";
  const totalSec = Math.floor(remainingMs / 1000);
  const days = Math.floor(totalSec / 86_400);
  const hours = Math.floor((totalSec % 86_400) / 3_600);
  const mins = Math.floor((totalSec % 3_600) / 60);
  const secs = totalSec % 60;
  if (days > 0) return `Opens in ${days}d ${hours}h`;
  if (hours > 0) return `Opens in ${hours}h ${mins}m`;
  if (mins > 0) return `Opens in ${mins}m ${secs}s`;
  return `Opens in ${secs}s`;
}

export function NextDraftCountdown({ draftOpensAt, className }: Props) {
  const router = useRouter();
  const target =
    draftOpensAt instanceof Date ? draftOpensAt : new Date(draftOpensAt);
  const [now, setNow] = useState(() => Date.now());
  const [hasRefreshed, setHasRefreshed] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const remaining = target.getTime() - now;

  // AC8: when the countdown reaches 0, the draft.open worker job is firing
  // server-side. Wait a couple seconds for it to flip Game.status to
  // "draft-open" then trigger a server-component refresh so the page
  // re-renders with the live draft view instead of the now-stale countdown.
  // The worker is on a separate process so there's a real window where
  // status hasn't flipped yet; if the first refresh still shows pending,
  // the countdown will keep ticking and try again on the next iteration
  // when remaining is still <= 0 (capped by hasRefreshed to avoid an
  // infinite loop within a single load — page reload resets the gate).
  useEffect(() => {
    if (remaining > 0 || hasRefreshed) return;
    const timer = setTimeout(() => {
      router.refresh();
      setHasRefreshed(true);
    }, 2000);
    return () => clearTimeout(timer);
  }, [remaining, hasRefreshed, router]);

  return (
    <span className={className ?? "text-sm font-medium text-orange-400"}>
      {formatCountdown(remaining)}
    </span>
  );
}
