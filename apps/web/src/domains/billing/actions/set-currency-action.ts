"use server";

import { cookies } from "next/headers";

import {
  type Currency,
  currencySchema,
} from "@repo/api/domains/billing/schemas/billing";
import { getCookieConfig } from "@repo/common/tools/cookies/common";

/** Keeps the currency the user chose for prices, for a year. */
export async function setCurrencyAction(currency: Currency) {
  const cookieStore = await cookies();
  const config = getCookieConfig("currency");
  cookieStore.set(config.name, currencySchema.parse(currency), {
    ...config.options,
    expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365),
  });
}
