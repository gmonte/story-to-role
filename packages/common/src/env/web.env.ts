import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

import { refineServerEnv } from "./refine-server-env";
import { webEnvRuntime } from "./web-env-runtime";

export const env = createEnv({
  server: {
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: z.coerce.number().default(3000),

    VERCEL_URL: z.string().optional(),
    // The fixed host a deployment is served from (no scheme), which Vercel
    // doesn't expose: CI passes it to staging and PR previews
    // (`vercel deploy -b/-e APP_URL=...`), and production sets it as a Vercel
    // Production env var (storytorole.vercel.app).
    APP_URL: z.string().optional(),

    DATABASE_URL: z.string(),
    DATABASE_DB_PREFIX: z.string().default(""),
    DB_MIGRATING: z
      .enum(["true", "false"])
      .default("false")
      .transform((val) => val === "true")
      .optional(),

    CLERK_SECRET_KEY: z.string(),
    CLERK_WEBHOOK_SIGNING_SECRET: z.string(),

    // Standard Upstash names (`Redis.fromEnv()` reads them); locally the SRH
    // container from `compose.yaml`.
    UPSTASH_REDIS_REST_URL: z.string(),
    UPSTASH_REDIS_REST_TOKEN: z.string(),
    // Prefix for every Redis key. Staging and PR previews share one Upstash
    // database, so CI passes one per preview (`stg:`, `pr-<number>:`);
    // production and local development each have their own and need none.
    REDIS_KEY_PREFIX: z.string().default(""),

    TRIGGER_PROJECT_REF: z.string(),
    TRIGGER_SECRET_KEY: z.string(),

    // StoryToRole's own key: the topic gate and the default provider package.
    ANTHROPIC_API_KEY: z.string(),

    STRIPE_SECRET_KEY: z.string(),
    STRIPE_WEBHOOK_SECRET: z.string(),

    // `local` is only allowed when NEXT_PUBLIC_ENV=development.
    STORAGE_DRIVER: z.enum(["local", "vercel-blob"]).default("vercel-blob"),
    // Required when STORAGE_DRIVER=vercel-blob.
    BLOB_READ_WRITE_TOKEN: z.string().optional(),

    // Wraps every user's data key (envelope encryption of career content and
    // bring-your-own keys): `v<version>:<base64 of 32 random bytes>`. Generate
    // one with `echo "v1:$(openssl rand -base64 32)"`. When rotating, move the
    // old value to ENCRYPTION_PREVIOUS_MASTER_KEYS (comma-separated) so data
    // keys wrapped by it stay readable.
    ENCRYPTION_MASTER_KEY: z.string().regex(/^v\d+:[A-Za-z0-9+/]{43}=$/),
    ENCRYPTION_PREVIOUS_MASTER_KEYS: z.string().optional(),
  },

  client: {
    NEXT_PUBLIC_ENV: z
      .enum(["development", "preview", "production"])
      .default("development"),

    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string(),
    NEXT_PUBLIC_CLERK_SIGN_IN_URL: z.string().default("/sign-in"),
    NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL: z.string().default("/app"),
    NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL: z.string().default("/app"),

    NEXT_PUBLIC_LOGGER_LEVEL: z.string().default("info"),
    NEXT_PUBLIC_LOGGER_TRACE: z
      .enum(["true", "false"])
      .optional()
      .transform((val) => val === "true"),
  },

  runtimeEnv: webEnvRuntime,

  createFinalSchema: (shape, isServer) =>
    z.object(shape).superRefine((env, ctx) => {
      if (isServer) refineServerEnv(env, ctx);
    }),

  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
