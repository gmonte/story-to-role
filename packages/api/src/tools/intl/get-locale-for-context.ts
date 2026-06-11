import { intlConfig, type Locale } from "@repo/intl/intl-config";
import { getCookieConfig } from "@repo/common/tools/cookies/common";

import { getLocaleFromHeaders } from "./get-locale-from-headers";

export function getLocaleForContext({
  cookies,
  headers,
}: {
  cookies: Readonly<Record<string, string | undefined>>;
  headers: Headers;
}): Locale {
  const intlLocaleCookieConfig = getCookieConfig("intl-locale");

  const cookieLocale = cookies[intlLocaleCookieConfig.name];

  if (cookieLocale && intlConfig.localeCodes.includes(cookieLocale as Locale)) {
    return cookieLocale as Locale;
  }

  return getLocaleFromHeaders(headers);
}
