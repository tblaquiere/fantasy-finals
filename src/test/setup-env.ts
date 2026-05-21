/**
 * Vitest setup file — loads .env into process.env before any test imports
 * env-validating modules (src/env.js → @t3-oss/env-nextjs).
 *
 * Without this, test files that transitively import `~/server/db` are flaky:
 * they pass when an earlier-loaded file happened to populate process.env via
 * Vite's loadEnv, and fail otherwise. The failure mode is opaque ("Invalid
 * environment variables: DATABASE_URL required") even though .env is present
 * in the project root.
 *
 * Node 20+ has built-in dotenv via process.loadEnvFile. We use that to keep
 * dependencies lean.
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(process.cwd(), ".env");
if (existsSync(envPath)) {
  // Node 20.6+ built-in; in older runtimes this would throw and tests would
  // fall back to whatever the environment already has.
  try {
    process.loadEnvFile(envPath);
  } catch {
    // best-effort — if Node is too old, surface the underlying env error at
    // import-time when src/env.js validates
  }
}
