import { getTranslation } from "@repo/intl/get-translation";

import { BillingView } from "~/domains/billing/components/billing-view";
import { WorkspacePage } from "~/domains/workspace/components/workspace-page";
import { getLocaleFromNextCookies } from "~/tools/intl/utils/get-locale-from-next-cookies";

export default async function BillingPage() {
  const t = await getTranslation(await getLocaleFromNextCookies());

  return (
    <WorkspacePage
      title={t.formatMessage({ defaultMessage: "Plan and credits" })}
      chat={<BillingView />}
    />
  );
}
