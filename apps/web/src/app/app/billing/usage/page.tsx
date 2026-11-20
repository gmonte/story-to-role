import { getTranslation } from "@repo/intl/get-translation";

import { UsageStatementView } from "~/domains/credits/components/usage-statement-view";
import { WorkspacePage } from "~/domains/workspace/components/workspace-page";
import { getLocaleFromNextCookies } from "~/tools/intl/utils/get-locale-from-next-cookies";

export default async function UsagePage() {
  const t = await getTranslation(await getLocaleFromNextCookies());

  return (
    <WorkspacePage
      title={t.formatMessage({ defaultMessage: "Usage statement" })}
      chat={<UsageStatementView />}
    />
  );
}
