import { intlConfig, type Locale } from "@repo/intl/intl-config";
import { matchLocale } from "@repo/intl/match-locale";
import { logger } from "@repo/common/tools/logger";

export function getLocaleFromHeaders(headers: Headers): Locale {
  const acceptLanguage = headers.get("accept-language");

  if (!acceptLanguage) {
    return intlConfig.defaultLocale;
  }

  const languages = acceptLanguage
    .split(",")
    .map((part) => part.split(";")[0]!.trim())
    .filter(Boolean);

  try {
    return matchLocale(languages);
  } catch (error) {
    logger.error(
      ["intl", "get-locale-from-headers"],
      "Failed to match locale",
      { error }
    );
    return intlConfig.defaultLocale;
  }
}
