import { db } from "~/server/db";
import { type Session } from "next-auth";

// Creates a fake session for test contexts
export function makeSession(overrides?: Partial<Session["user"]>): Session {
  return {
    user: {
      id: overrides?.id ?? "test-user-id",
      email: overrides?.email ?? "test@example.com",
      name: overrides?.name ?? "Test User",
      role: overrides?.role ?? "participant",
    },
    expires: new Date(Date.now() + 86_400_000).toISOString(),
  };
}

export { db };
