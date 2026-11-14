import { defineConfig } from "@trigger.dev/sdk";
import { syncEnvVars } from "@trigger.dev/build/extensions/core";

import { webEnvRuntime } from "@repo/common/env/web-env-runtime";

/**
 * Copies the env schema's variables (web.env.ts) from the build environment
 * into the deployed Trigger.dev environment. The deploy runs inside the
 * Vercel build (predeploy), so process.env already holds the right
 * environment's values: production for main, preview for staging. Syncing the
 * schema's own names needs no Vercel API token and sends the worker nothing it
 * doesn't read. Trigger.dev manages TRIGGER_* itself.
 */
const syncWebEnv = syncEnvVars(
  () =>
    Object.keys(webEnvRuntime)
      .filter((name) => !name.startsWith("TRIGGER_"))
      .flatMap((name) => {
        const value = process.env[name];
        return value ? [{ name, value }] : [];
      }),
  { override: true }
);

/**
 * Trigger.dev config. Tasks live in each domain's `tasks/` folder and run on
 * Trigger.dev's managed infra (no Vercel duration cap). `TRIGGER_PROJECT_REF` is
 * read from `process.env` (set per Vercel environment) so it routes to the right
 * project, and so the config doesn't require the full `web.env` schema at build.
 */
export default defineConfig({
  project: process.env.TRIGGER_PROJECT_REF!,
  dirs: ["./src/domains/tasks/tasks", "./src/domains/chat/tasks"],
  build: {
    extensions: [syncWebEnv],
  },
  // Generous ceiling: resume generation with review rounds takes minutes.
  maxDuration: 3600,
});
