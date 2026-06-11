import { intlConfig, type Locale } from "./intl-config";

export type Direction = "rtl" | "ltr";

export type LocaleDirectionResult = {
  direction: Direction;
  isRtl: boolean;
  isLtr: boolean;
};

export function getLocaleDirection(locale: Locale): LocaleDirectionResult {
  const config = intlConfig.locales[locale];
  const isRtl = config && "rtl" in config && config.rtl;
  return {
    direction: isRtl ? "rtl" : "ltr",
    isRtl,
    isLtr: !isRtl,
  };
}
