import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

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

  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    PORT: process.env.PORT,
    VERCEL_URL: process.env.VERCEL_URL,
    APP_URL: process.env.APP_URL,
    DATABASE_URL: process.env.DATABASE_URL,
    DATABASE_DB_PREFIX: process.env.DATABASE_DB_PREFIX,
    DB_MIGRATING: process.env.DB_MIGRATING,
    CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
    CLERK_WEBHOOK_SIGNING_SECRET: process.env.CLERK_WEBHOOK_SIGNING_SECRET,
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
    REDIS_KEY_PREFIX: process.env.REDIS_KEY_PREFIX,
    TRIGGER_PROJECT_REF: process.env.TRIGGER_PROJECT_REF,
    TRIGGER_SECRET_KEY: process.env.TRIGGER_SECRET_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    STORAGE_DRIVER: process.env.STORAGE_DRIVER,
    BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN,

    NEXT_PUBLIC_ENV: process.env.NEXT_PUBLIC_ENV,
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    NEXT_PUBLIC_CLERK_SIGN_IN_URL: process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL,
    NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL:
      process.env.NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL,
    NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL:
      process.env.NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL,
    NEXT_PUBLIC_LOGGER_LEVEL: process.env.NEXT_PUBLIC_LOGGER_LEVEL,
    NEXT_PUBLIC_LOGGER_TRACE: process.env.NEXT_PUBLIC_LOGGER_TRACE,
  },

  createFinalSchema: (shape, isServer) =>
    z.object(shape).superRefine((env, ctx) => {
      if (
        isServer &&
        env.NEXT_PUBLIC_ENV === "preview" &&
        !env.REDIS_KEY_PREFIX
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["REDIS_KEY_PREFIX"],
          message: "REDIS_KEY_PREFIX is required when NEXT_PUBLIC_ENV=preview",
        });
      }
    }),

  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
