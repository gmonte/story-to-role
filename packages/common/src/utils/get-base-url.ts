import { env } from "@repo/common/env/web.env";

export function getBaseUrl() {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  // The fixed host: from CI for staging and pr-<number>, from Vercel env for production.
  if (env.APP_URL) {
    return `https://${env.APP_URL}`;
  }
  if (env.VERCEL_URL) {
    if (env.VERCEL_URL.startsWith("localhost")) {
      return `http://${env.VERCEL_URL}`;
    }
    return `https://${env.VERCEL_URL}`;
  }
  return `http://localhost:${env.PORT ?? 3000}`;
}
