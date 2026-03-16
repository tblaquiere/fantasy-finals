"use client";

import { useEffect, useState } from "react";
import { getApps, initializeApp } from "firebase/app";
import { getMessaging, getToken } from "firebase/messaging";

import { env } from "~/env.js";
import { api } from "~/trpc/react";

function initFirebaseClient() {
  if (getApps().length === 0) {
    initializeApp({
      apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      messagingSenderId: env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: env.NEXT_PUBLIC_FIREBASE_APP_ID,
    });
  }
}

export function PushPermissionPrompt() {
  const [permission, setPermission] = useState<NotificationPermission | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [setupError, setSetupError] = useState(false);

  const saveToken = api.notification.saveToken.useMutation();

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setPermission(Notification.permission);
    }
  }, []);

  // Not supported or SSR
  if (permission === null) return null;
  // Already granted — no prompt needed
  if (permission === "granted") return null;

  if (permission === "denied") {
    return (
      <p className="mt-4 text-xs text-zinc-500">
        Notifications blocked — enable in your browser settings to receive
        alerts.
      </p>
    );
  }

  const handleEnable = async () => {
    setLoading(true);
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== "granted") return;

      initFirebaseClient();
      // Prefer an existing root-scope SW (production PWA SW with FCM importScripts);
      // fall back to registering the FCM SW directly (dev / first run)
      const registrations = await navigator.serviceWorker.getRegistrations();
      const existingRoot = registrations.find(
        (r) => r.scope === `${window.location.origin}/`,
      );
      const registration =
        existingRoot ??
        (await navigator.serviceWorker.register("/api/firebase-messaging-sw", {
          scope: "/",
        }));
      const messaging = getMessaging();
      const token = await getToken(messaging, {
        vapidKey: env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
        serviceWorkerRegistration: registration,
      });
      if (!token) {
        console.warn("[PushPermissionPrompt] getToken() returned empty token");
        return;
      }
      await saveToken.mutateAsync({ token });
    } catch (err) {
      console.error("[PushPermissionPrompt] Error enabling notifications:", err);
      setSetupError(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button
        onClick={handleEnable}
        disabled={loading}
        className="mt-4 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-orange-600 disabled:opacity-50"
      >
        {loading ? "Enabling…" : "Enable Notifications"}
      </button>
      {setupError && (
        <p className="mt-2 text-xs text-red-400">
          Failed to enable notifications — please try again.
        </p>
      )}
    </div>
  );
}
