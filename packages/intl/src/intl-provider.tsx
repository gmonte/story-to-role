"use client";

import type { ReactNode } from "react";

import {
  IntlProvider as ReactIntlProvider,
  type ResolvedIntlConfig,
} from "react-intl";

import type { Locale } from "./intl-config";
import { onIntlError } from "./utils/on-intl-error";

export type IntlProviderProps = {
  children: ReactNode;
  locale: Locale;
  messages: ResolvedIntlConfig["messages"];
};

export function IntlProvider({
  children,
  locale,
  messages,
}: IntlProviderProps) {
  return (
    <ReactIntlProvider
      locale={locale}
      messages={messages}
      onError={onIntlError}
    >
      {children}
    </ReactIntlProvider>
  );
}
