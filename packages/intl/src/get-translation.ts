import { cache, type ReactNode } from "react";

import {
  createIntl,
  type IntlShape,
  type MessageDescriptor,
  type ResolvedIntlConfig,
} from "@formatjs/intl";

import {
  getLocaleDirection,
  type LocaleDirectionResult,
} from "./get-locale-direction";
import { intlConfig, type Locale } from "./intl-config";
import { onIntlError } from "./utils/on-intl-error";
import type { IntlMessage } from "../intl-message-types";

type IntlShapeOverride = Omit<IntlShape, "formatMessage">;

type TypedMessageDescriptor = {
  defaultMessage: IntlMessage | (string & {});
} & Omit<MessageDescriptor, "defaultMessage">;

type TypedIntlShape = {
  formatMessage(
    descriptor: TypedMessageDescriptor,
    values?: Record<string, string | ((chunks: string) => ReactNode)>
  ): string;
};

export const getTranslation = cache(
  async (
    locale: Locale
  ): Promise<
    TypedIntlShape &
      IntlShapeOverride &
      LocaleDirectionResult & { locale: Locale }
  > => {
    const results = await Promise.allSettled([
      getMessagesForLocale(intlConfig.defaultLocale),
      getMessagesForLocale(locale),
    ]);

    const messages = results.reduce<ResolvedIntlConfig["messages"]>(
      (acc, curr) => {
        if (curr.status === "fulfilled") {
          return { ...acc, ...curr.value };
        }
        return acc;
      },
      {}
    );

    const intl = createIntl({
      locale,
      messages,
      onError: onIntlError,
    }) as TypedIntlShape & IntlShapeOverride;

    return {
      ...intl,
      ...getLocaleDirection(locale),
      locale,
    };
  }
);

const getMessagesForLocale = cache(async (locale: string) => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  return (await import(`../compiled/${locale}.json`)).default as object;
});
