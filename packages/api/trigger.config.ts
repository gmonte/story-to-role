import { defineConfig } from "@trigger.dev/sdk";
import { syncEnvVars } from "@trigger.dev/build/extensions/core";

import { defaultMaxDuration } from "./src/domains/tasks/task-durations";

/* eslint-disable no-console -- deploy build extension: logs show up in deploy output. */

const BUILD_ONLY_VARS = ["REDIS_KEY_PREFIX", "APP_URL"];

type VercelEnvVar = {
  key: string;
  value?: string;
  target: string[];
  gitBranch?: string | null;
};

/**
 * Sync env vars from the CURRENT Vercel environment into the deployed Trigger
 * environment. Unlike `syncVercelEnvVars` (which maps the Trigger deploy env to
 * a fixed Vercel env — `prod` → Vercel "production"), this pulls whichever Vercel
 * env the build is for (`$NEXT_PUBLIC_ENV`): production for `main`, preview for
 * staging/previews. That fits our setup of two prod-only Trigger projects.
 *
 * Runs inside the Vercel build, so values come from `process.env` (Vercel
 * injects the target's values); the Vercel API only supplies the key list.
 * Needs VERCEL_PROJECT_ID + VERCEL_ACCESS_TOKEN (or VERCEL_TOKEN), optional
 * VERCEL_TEAM_ID, in the build env.
 */
const syncVercelEnvForCurrentTarget = syncEnvVars(
  async ({ env }) => {
    const read = (key: string) => process.env[key] ?? env[key];

    const vercelTarget = read("NEXT_PUBLIC_ENV") ?? "production";
    const projectId = read("VERCEL_PROJECT_ID");
    const token = read("VERCEL_ACCESS_TOKEN") ?? read("VERCEL_TOKEN");
    const teamId = read("VERCEL_TEAM_ID");
    const gitBranch = read("VERCEL_GIT_COMMIT_REF");

    console.log(
      `[sync-env] NEXT_PUBLIC_ENV=${read("NEXT_PUBLIC_ENV") ?? "(unset, defaulting to production)"} → syncing Vercel "${vercelTarget}" env vars`
    );

    if (!projectId || !token) {
      throw new Error(
        "syncVercelEnvForCurrentTarget: VERCEL_PROJECT_ID and VERCEL_ACCESS_TOKEN/VERCEL_TOKEN are required."
      );
    }

    const query = new URLSearchParams({
      decrypt: "true",
      target: vercelTarget,
    });
    if (teamId) {
      query.set("teamId", teamId);
    }

    const response = await fetch(
      `https://api.vercel.com/v9/projects/${projectId}/env?${query.toString()}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!response.ok) {
      throw new Error(
        `syncVercelEnvForCurrentTarget: Vercel API error ${response.status}`
      );
    }

    const data = (await response.json()) as { envs: VercelEnvVar[] };
    const isBranchable = vercelTarget === "preview";

    const variables = data.envs
      .filter((envVar) => {
        if (!envVar.target.includes(vercelTarget)) {
          return false;
        }
        // Skip vars scoped to a different git branch (branch-specific preview vars).
        if (
          isBranchable &&
          envVar.gitBranch &&
          envVar.gitBranch !== gitBranch
        ) {
          return false;
        }
        return true;
      })
      .map((envVar) => ({
        name: envVar.key,
        value: process.env[envVar.key] ?? envVar.value ?? "",
      }))
      .filter((variable) => variable.value !== "");

    // Values CI passes to the build itself (`vercel deploy -b`), which the
    // Vercel API doesn't list: staging's REDIS_KEY_PREFIX ("stg:") and APP_URL.
    for (const name of BUILD_ONLY_VARS) {
      const value = process.env[name];
      if (value && !variables.some((variable) => variable.name === name)) {
        variables.push({ name, value });
      }
    }

    // Names only — never log values.
    console.log(
      `[sync-env] ${variables.length} var(s) from Vercel "${vercelTarget}": ${variables
        .map((variable) => variable.name)
        .join(", ")}`
    );

    return variables;
  },
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
  dirs: [
    "./src/domains/tasks/tasks",
    "./src/domains/openings/tasks",
    "./src/domains/profile/tasks",
    "./src/domains/documents/tasks",
    "./src/domains/applications/tasks",
    "./src/domains/applications/tracker/tasks",
    "./src/domains/credits/tasks",
    "./src/domains/billing/tasks",
    "./src/domains/agents/tasks",
  ],
  build: {
    extensions: [syncVercelEnvForCurrentTarget],
    // Installed, not bundled: the local embedding model's native runtime,
    // and the PDF renderer, whose font files load through package imports
    // ("#standard-fonts/…") a bundle can't resolve.
    external: [
      "@huggingface/transformers",
      "onnxruntime-node",
      "sharp",
      "@react-pdf/renderer",
    ],
  },
  // Generous ceiling: resume generation with review rounds takes minutes.
  maxDuration: defaultMaxDuration,
});
