/**
 * notification.send handler — Story 4.2
 *
 * Dispatches FCM web push notifications to all registered devices for a user.
 * Cleans up stale tokens automatically.
 */

import type { Job } from "pg-boss";

import { db } from "~/server/db";
import { sendNotification } from "~/server/services/fcm";

export type NotificationSendPayload = {
  userId: string;
  type: string;
  leagueId?: string;
  gameId?: string;
  link?: string;
  participantName?: string;
  playerName?: string;
};

const NOTIFICATION_TEMPLATES: Record<
  string,
  (p: NotificationSendPayload) => { title: string; body: string }
> = {
  "game-results": () => ({
    title: "Game Final!",
    body: "The game is over — check the final scores and see how your pick did.",
  }),
  "draft-open": () => ({
    title: "Draft is Open!",
    body: "The draft window is now open. Get ready to make your pick!",
  }),
  "your-turn": () => ({
    title: "It's Your Turn!",
    body: "You're on the clock — make your pick now.",
  }),
  "pick-reminder": () => ({
    title: "Pick Reminder",
    body: "Your selection clock is running out. Make your pick before time expires!",
  }),
  "pick-overridden": (p) => ({
    title: "Pick Overridden",
    body: `The commissioner has overridden ${p.participantName ? `${p.participantName}'s` : "a"} pick.`,
  }),
  "auto-assigned": (p) => ({
    title: "Auto-Assigned Pick",
    body: p.playerName
      ? `${p.playerName} was auto-assigned because the clock expired.`
      : "A player was auto-assigned because the clock expired.",
  }),
  "no-eligible-player": () => ({
    title: "Commissioner Action Needed",
    body: "Auto-assign failed — no eligible players found. Please override manually.",
  }),
  "mozgov-triggered": () => ({
    title: "Mozgov Rule Triggered!",
    body: "Your player sat the first half. You have 3 min to replace them — they earn full game credit, every point counts.",
  }),
  "mozgov-your-turn": () => ({
    title: "Mozgov — Your Turn!",
    body: "Your 3-minute replacement window is now open. Pick a replacement player!",
  }),
  "draft-order-provisional": () => ({
    title: "Next Draft Order Posted",
    body: "Provisional order is up — check where you pick. May shift if NBA stat corrections land within 24 hours.",
  }),
  "draft-order-updated": () => ({
    title: "Your Pick Position Changed",
    body: "A stat correction updated the standings. Tap to see your new pick position.",
  }),
};

export async function handleNotificationSend(
  jobs: Job<NotificationSendPayload>[],
): Promise<void> {
  const job = jobs[0];
  if (!job) return;

  const payload = job.data;
  console.log(
    `[worker] notification.send: userId=${payload.userId} type=${payload.type}`,
  );

  // Look up all push tokens for this user
  const subscriptions = await db.pushSubscription.findMany({
    where: { userId: payload.userId },
    select: { id: true, token: true },
  });

  if (subscriptions.length === 0) {
    console.log(
      `[worker] notification.send: no push tokens for user ${payload.userId}`,
    );
    return;
  }

  // Resolve template
  const templateFn = NOTIFICATION_TEMPLATES[payload.type];
  if (!templateFn) {
    console.warn(
      `[worker] notification.send: unknown type "${payload.type}"`,
    );
    return;
  }
  const { title, body } = templateFn(payload);

  // Send to each device, collect stale tokens
  const staleIds: string[] = [];
  for (const sub of subscriptions) {
    const result = await sendNotification(sub.token, {
      title,
      body,
      link: payload.link,
    });
    if (!result.ok && result.error === "stale-token") {
      staleIds.push(sub.id);
    }
  }

  // Prune stale tokens
  if (staleIds.length > 0) {
    await db.pushSubscription.deleteMany({
      where: { id: { in: staleIds } },
    });
    console.log(
      `[worker] notification.send: pruned ${staleIds.length} stale token(s)`,
    );
  }
}
