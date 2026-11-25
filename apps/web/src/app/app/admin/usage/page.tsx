import { auth } from "@clerk/nextjs/server";

import { getTranslation } from "@repo/intl/get-translation";

import { AdminView } from "~/domains/credits/components/admin-view";
import { PlatformUsageView } from "~/domains/credits/components/platform-usage-view";
import { WorkspacePage } from "~/domains/workspace/components/workspace-page";
import { getLocaleFromNextCookies } from "~/tools/intl/utils/get-locale-from-next-cookies";

export default async function AdminUsagePage() {
  await auth.protect();
  const t = await getTranslation(await getLocaleFromNextCookies());

  return (
    <WorkspacePage
      title={t.formatMessage({ defaultMessage: "Admin" })}
      chat={
        <AdminView>
          <PlatformUsageView />
        </AdminView>
      }
    />
  );
}
