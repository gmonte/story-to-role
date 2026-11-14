import { afterEach, describe, expect, it, vi } from "vitest";

const validServerEnv = {
  SKIP_ENV_VALIDATION: "",
  NEXT_PUBLIC_ENV: "development",
  DATABASE_URL: "postgres://localhost:5432/story_to_role",
  CLERK_SECRET_KEY: "sk_test",
  CLERK_WEBHOOK_SIGNING_SECRET: "whsec_test",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test",
  UPSTASH_REDIS_REST_URL: "http://localhost:8079",
  UPSTASH_REDIS_REST_TOKEN: "token",
  TRIGGER_PROJECT_REF: "proj_test",
  TRIGGER_SECRET_KEY: "tr_dev_test",
  ANTHROPIC_API_KEY: "sk-ant-test",
  STRIPE_SECRET_KEY: "sk_test",
  STRIPE_WEBHOOK_SECRET: "whsec_test",
  STORAGE_DRIVER: "local",
  BLOB_READ_WRITE_TOKEN: "",
  REDIS_KEY_PREFIX: "",
  ENCRYPTION_MASTER_KEY: `v1:${Buffer.alloc(32, 7).toString("base64")}`,
};

async function loadEnv(overrides: Record<string, string>) {
  for (const [key, value] of Object.entries({
    ...validServerEnv,
    ...overrides,
  })) {
    vi.stubEnv(key, value);
  }
  vi.resetModules();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  return import("./web.env");
}

describe("server env at startup", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("starts with local storage in development", async () => {
    const { env } = await loadEnv({});
    expect(env.STORAGE_DRIVER).toBe("local");
  });

  it.each(["preview", "production"])(
    "refuses local storage when NEXT_PUBLIC_ENV=%s",
    async (environment) => {
      await expect(
        loadEnv({ NEXT_PUBLIC_ENV: environment, REDIS_KEY_PREFIX: "stg:" })
      ).rejects.toThrow("Invalid environment variables");
    }
  );

  it("refuses vercel-blob storage without a token", async () => {
    await expect(
      loadEnv({ NEXT_PUBLIC_ENV: "production", STORAGE_DRIVER: "vercel-blob" })
    ).rejects.toThrow("Invalid environment variables");
  });

  it("starts with vercel-blob storage and a token", async () => {
    const { env } = await loadEnv({
      NEXT_PUBLIC_ENV: "production",
      STORAGE_DRIVER: "vercel-blob",
      BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_test",
    });
    expect(env.STORAGE_DRIVER).toBe("vercel-blob");
  });

  it("refuses a preview without a Redis key prefix", async () => {
    await expect(
      loadEnv({
        NEXT_PUBLIC_ENV: "preview",
        STORAGE_DRIVER: "vercel-blob",
        BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_test",
      })
    ).rejects.toThrow("Invalid environment variables");
  });

  it("refuses a master key without a version", async () => {
    await expect(
      loadEnv({
        ENCRYPTION_MASTER_KEY: Buffer.alloc(32, 7).toString("base64"),
      })
    ).rejects.toThrow("Invalid environment variables");
  });
});
