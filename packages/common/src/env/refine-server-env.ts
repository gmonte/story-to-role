import type { z } from "zod";

type ServerEnvRules = {
  NEXT_PUBLIC_ENV?: "development" | "preview" | "production";
  REDIS_KEY_PREFIX?: string;
  STORAGE_DRIVER?: "local" | "vercel-blob";
  BLOB_READ_WRITE_TOKEN?: string;
};

/**
 * Cross-variable rules the server refuses to start without. They run when the
 * env module is first imported (`next.config.ts` imports it), so a bad
 * combination fails the build and the boot, never a request.
 */
export function refineServerEnv(env: ServerEnvRules, ctx: z.RefinementCtx) {
  if (env.NEXT_PUBLIC_ENV === "preview" && !env.REDIS_KEY_PREFIX) {
    ctx.addIssue({
      code: "custom",
      path: ["REDIS_KEY_PREFIX"],
      message: "REDIS_KEY_PREFIX is required when NEXT_PUBLIC_ENV=preview",
    });
  }

  // Local files would vanish between serverless instances and leak across
  // deployments: only a developer machine may use them.
  if (env.STORAGE_DRIVER === "local" && env.NEXT_PUBLIC_ENV !== "development") {
    ctx.addIssue({
      code: "custom",
      path: ["STORAGE_DRIVER"],
      message:
        "STORAGE_DRIVER=local is only allowed when NEXT_PUBLIC_ENV=development",
    });
  }

  if (env.STORAGE_DRIVER === "vercel-blob" && !env.BLOB_READ_WRITE_TOKEN) {
    ctx.addIssue({
      code: "custom",
      path: ["BLOB_READ_WRITE_TOKEN"],
      message:
        "BLOB_READ_WRITE_TOKEN is required when STORAGE_DRIVER=vercel-blob",
    });
  }
}
