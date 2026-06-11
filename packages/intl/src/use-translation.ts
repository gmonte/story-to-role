"use client";

import type { ReactNode } from "react";

import { useIntl, type IntlShape, type MessageDescriptor } from "react-intl";

import {
  getLocaleDirection,
  type LocaleDirectionResult,
} from "./get-locale-direction";
import type { Locale } from "./intl-config";
import type { IntlMessage } from "../intl-message-types";

type IntlShapeOverride = Omit<IntlShape, "formatMessage">;

type TypedMessageDescriptor = {
  defaultMessage: IntlMessage | (string & {});
} & Omit<MessageDescriptor, "defaultMessage">;

type TypedIntlShape = {
  formatMessage(
    descriptor: TypedMessageDescriptor,
    values?: Record<string, ReactNode | ((chunks: ReactNode) => ReactNode)>
  ): string;
};

type UseTranslationReturnType = TypedIntlShape &
  IntlShapeOverride &
  LocaleDirectionResult & {
    locale: Locale;
  };

export function useTranslation(): UseTranslationReturnType {
  const intl = useIntl() as TypedIntlShape & IntlShapeOverride;

  return {
    ...intl,
    ...getLocaleDirection(intl.locale as Locale),
    locale: intl.locale as Locale,
  };
}
