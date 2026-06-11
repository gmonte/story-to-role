import { match } from "@formatjs/intl-localematcher";

import { intlConfig, type Locale } from "./intl-config";

export function matchLocale(requestedLocales: string[]): Locale {
  const filteredLocales = requestedLocales
    .filter((locale) => locale !== "*")
    .map((locale) => locale.replace("_", "-"));

  if (filteredLocales.length === 0) {
    return intlConfig.defaultLocale;
  }

  return match(
    filteredLocales,
    intlConfig.localeCodes,
    intlConfig.defaultLocale
  ) as Locale;
}
