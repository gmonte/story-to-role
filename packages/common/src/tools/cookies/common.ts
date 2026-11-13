import { env } from "@repo/common/env/web.env";

import { cookiesConfig, type CookieName } from "./config";

export function getCookieConfig(name: CookieName) {
  const config = cookiesConfig.cookies[name];

  const cookiePrefix = getCookiePrefix();
  const cookieSuffix = getCookieSuffix();

  return {
    name: `${cookiePrefix}${name}${cookieSuffix}`,
    options: {
      httpOnly: config.httpOnly,
      path: config.path,
      sameSite: config.sameSite,
      secure: env.NEXT_PUBLIC_ENV !== "development",
    },
  };
}

export function parseHeaderCookie(
  headerCookie: string | null
): Readonly<Record<string, string | undefined>> {
  const cookieObject: Record<string, string | undefined> = {};

  if (!headerCookie) {
    return Object.freeze(cookieObject);
  }

  const cookies = headerCookie.split(";");

  for (const cookie of cookies) {
    const trimmedCookie = cookie.trim();
    if (!trimmedCookie) continue;

    const equalIndex = trimmedCookie.indexOf("=");
    if (equalIndex === -1) continue;

    const name = trimmedCookie.slice(0, equalIndex).trim();
    const value = trimmedCookie.slice(equalIndex + 1).trim();

    if (!name) continue;

    try {
      cookieObject[name] = decodeURIComponent(value);
    } catch {
      cookieObject[name] = value;
    }
  }

  return Object.freeze(cookieObject);
}

function getCookiePrefix(): string {
  return "story-to-role-";
}

function getCookieSuffix(): string {
  const environment = env.NEXT_PUBLIC_ENV;

  if (environment === "preview") return "-preview";
  if (environment === "development") return "-dev";

  return "";
}
