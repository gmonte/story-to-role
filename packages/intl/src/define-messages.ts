import {
  defineMessages as intlDefineMessages,
  type MessageDescriptor,
} from "@formatjs/intl";

import type { IntlMessage } from "../intl-message-types";

export type TypedMessageDescriptor = {
  defaultMessage: IntlMessage | (string & {});
} & Omit<MessageDescriptor, "defaultMessage">;

export function defineMessages<
  K extends PropertyKey,
  T = TypedMessageDescriptor,
  U extends Record<K, T> = Record<K, T>,
>(msgs: U): U {
  return intlDefineMessages(
    msgs as Record<string | number | symbol, MessageDescriptor>
  ) as U;
}
