import { env } from "@repo/common/env/web.env";

export function getBaseUrl() {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  if (env.VERCEL_URL) {
    if (env.VERCEL_URL.startsWith("localhost")) {
      return `http://${env.VERCEL_URL}`;
    }
    return `https://${env.VERCEL_URL}`;
  }
  return `http://localhost:${env.PORT ?? 3000}`;
}
