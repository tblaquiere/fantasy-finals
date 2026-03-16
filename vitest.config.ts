import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    globals: false, // use explicit imports: import { it, expect, describe } from "vitest"
    passWithNoTests: true,
    fileParallelism: false, // run test files sequentially — prevents FK race conditions on shared DB
    server: {
      deps: {
        // Force Vitest to process next/next-auth through Vite transformer
        // to fix ESM resolution errors (next-auth imports next/server without .js extension)
        inline: [/next-auth/, /^next$/],
      },
    },
  },
});
