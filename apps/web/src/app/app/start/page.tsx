import { getTranslation } from "@repo/intl/get-translation";

import { StartChoice } from "~/domains/career/components/start-choice";
import { WorkspacePage } from "~/domains/workspace/components/workspace-page";
import { getLocaleFromNextCookies } from "~/tools/intl/utils/get-locale-from-next-cookies";

export default async function StartPage() {
  const t = await getTranslation(await getLocaleFromNextCookies());

  return (
    <WorkspacePage
      title={t.formatMessage({ defaultMessage: "Welcome" })}
      chat={<StartChoice />}
    />
  );
}
