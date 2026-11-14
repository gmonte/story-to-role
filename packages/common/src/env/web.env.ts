import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: z.coerce.number().default(3000),

    VERCEL_URL: z.string().optional(),
    // The fixed alias a preview or staging deployment is served from, passed
    // by CI (`vercel deploy -b/-e APP_URL=...`); Vercel doesn't expose it.
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

  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
