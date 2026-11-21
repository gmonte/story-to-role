import { getTranslation } from "@repo/intl/get-translation";

import { BillingView } from "~/domains/billing/components/billing-view";
import { getCurrencyFromNextCookies } from "~/domains/billing/utils/get-currency-from-next-cookies";
import { WorkspacePage } from "~/domains/workspace/components/workspace-page";
import { getLocaleFromNextCookies } from "~/tools/intl/utils/get-locale-from-next-cookies";

export default async function BillingPage() {
  const locale = await getLocaleFromNextCookies();
  const t = await getTranslation(locale);
  const currency = await getCurrencyFromNextCookies(locale);

  return (
    <WorkspacePage
      title={t.formatMessage({ defaultMessage: "Plan and credits" })}
      chat={<BillingView currency={currency} />}
    />
  );
}
