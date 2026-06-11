import "server-only";

import { cookies } from "next/headers";

import { intlConfig, type Locale } from "@repo/intl/intl-config";
import { getCookieConfig } from "@repo/common/tools/cookies/common";

export async function getLocaleFromNextCookies(): Promise<Locale> {
  const cookieStore = await cookies();
  const intlLocaleCookieConfig = getCookieConfig("intl-locale");

  const cookieLocale = cookieStore.get(intlLocaleCookieConfig.name)?.value;

  if (cookieLocale && intlConfig.localeCodes.includes(cookieLocale as Locale)) {
    return cookieLocale as Locale;
  }

  return intlConfig.defaultLocale;
}
