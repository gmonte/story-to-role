import { getTranslation } from "@repo/intl/get-translation";

import { GuidedOpeningStart } from "~/domains/career/components/guided-opening-start";
import { WorkspacePage } from "~/domains/workspace/components/workspace-page";
import { getLocaleFromNextCookies } from "~/tools/intl/utils/get-locale-from-next-cookies";

export default async function GuidedOpeningPage() {
  const t = await getTranslation(await getLocaleFromNextCookies());

  return (
    <WorkspacePage
      title={t.formatMessage({ defaultMessage: "Your first opening" })}
      chat={<GuidedOpeningStart />}
    />
  );
}
