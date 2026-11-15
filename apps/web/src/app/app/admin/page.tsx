import { getTranslation } from "@repo/intl/get-translation";

import { CourtesyGrants } from "~/domains/credits/components/courtesy-grants";
import { WorkspacePage } from "~/domains/workspace/components/workspace-page";
import { getLocaleFromNextCookies } from "~/tools/intl/utils/get-locale-from-next-cookies";

export default async function AdminPage() {
  const t = await getTranslation(await getLocaleFromNextCookies());

  return (
    <WorkspacePage
      title={t.formatMessage({ defaultMessage: "Admin" })}
      chat={<CourtesyGrants />}
    />
  );
}
