"use server";

import { cookies } from "next/headers";

import type { Locale } from "@repo/intl/intl-config";
import { getCookieConfig } from "@repo/common/tools/cookies/common";
import { logger } from "@repo/common/tools/logger";

export async function setLocaleAction(locale: Locale) {
  const cookieStore = await cookies();
  const intlLocaleCookieConfig = getCookieConfig("intl-locale");

  logger.info(["intl", "set-locale-action"], "Setting locale", { locale });

  cookieStore.set(intlLocaleCookieConfig.name, locale, {
    ...intlLocaleCookieConfig.options,
    expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365),
  });
}
