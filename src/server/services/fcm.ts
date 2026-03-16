import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";

import { env } from "~/env.js";

export type NotificationPayload = {
  title: string;
  body: string;
  link?: string;
  data?: Record<string, string>;
};

function getAdminMessaging() {
  if (getApps().length === 0) {
    initializeApp({
      credential: cert({
        projectId: env.FIREBASE_ADMIN_PROJECT_ID,
        clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
        // Railway env vars store \n as literal \\n — replace back to actual newlines
        privateKey: env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      }),
    });
  }
  return getMessaging();
}

export async function sendNotification(
  token: string,
  payload: NotificationPayload,
): Promise<{ ok: boolean; error?: string }> {
  if (
    !env.FIREBASE_ADMIN_PROJECT_ID ||
    !env.FIREBASE_ADMIN_CLIENT_EMAIL ||
    !env.FIREBASE_ADMIN_PRIVATE_KEY
  ) {
    console.warn(
      "[FCM] Firebase Admin credentials not configured — skipping notification",
    );
    return { ok: true };
  }

  try {
    const messaging = getAdminMessaging();
    await messaging.send({
      notification: { title: payload.title, body: payload.body },
      webpush: {
        fcmOptions: { link: payload.link ?? "/" },
        headers: { TTL: "86400" },
        data: payload.data,
      },
      token,
    });
    return { ok: true };
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (
      code === "messaging/invalid-registration-token" ||
      code === "messaging/registration-token-not-registered"
    ) {
      return { ok: false, error: "stale-token" };
    }
    console.error("[FCM] sendNotification error:", error);
    return { ok: false, error: "send-failed" };
  }
}
