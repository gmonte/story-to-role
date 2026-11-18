import { getTranslation } from "@repo/intl/get-translation";

import { TrackerView } from "~/domains/applications/components/tracker-view";
import { WorkspacePage } from "~/domains/workspace/components/workspace-page";
import { getLocaleFromNextCookies } from "~/tools/intl/utils/get-locale-from-next-cookies";

export default async function TrackerPage() {
  const t = await getTranslation(await getLocaleFromNextCookies());

  return (
    <WorkspacePage
      title={t.formatMessage({ defaultMessage: "Applications" })}
      chat={<TrackerView />}
    />
  );
}
