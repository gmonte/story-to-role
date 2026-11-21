import "server-only";

import { cookies } from "next/headers";

import {
  type Currency,
  currencySchema,
} from "@repo/api/domains/billing/schemas/billing";
import type { Locale } from "@repo/intl/intl-config";
import { getCookieConfig } from "@repo/common/tools/cookies/common";

/**
 * The currency the user chose for prices (billing spec, "Currencies");
 * until they choose, reais for the Brazilian interface and dollars
 * otherwise.
 */
export async function getCurrencyFromNextCookies(
  locale: Locale
): Promise<Currency> {
  const cookieStore = await cookies();
  const chosen = currencySchema.safeParse(
    cookieStore.get(getCookieConfig("currency").name)?.value
  );
  if (chosen.success) return chosen.data;
  return locale === "pt-BR" ? "brl" : "usd";
}
