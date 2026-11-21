import { getTranslation } from "@repo/intl/get-translation";

import { AdminView } from "~/domains/credits/components/admin-view";
import { CourtesyGrants } from "~/domains/credits/components/courtesy-grants";
import { WorkspacePage } from "~/domains/workspace/components/workspace-page";
import { getLocaleFromNextCookies } from "~/tools/intl/utils/get-locale-from-next-cookies";

export default async function AdminCourtesyPage() {
  const t = await getTranslation(await getLocaleFromNextCookies());

  return (
    <WorkspacePage
      title={t.formatMessage({ defaultMessage: "Admin" })}
      chat={
        <AdminView>
          <CourtesyGrants />
        </AdminView>
      }
    />
  );
}
