import { getTranslation } from "@repo/intl/get-translation";

import { WritingSettings } from "~/domains/documents/components/writing-settings";
import { WorkspacePage } from "~/domains/workspace/components/workspace-page";
import { getLocaleFromNextCookies } from "~/tools/intl/utils/get-locale-from-next-cookies";

export default async function WritingPage() {
  const t = await getTranslation(await getLocaleFromNextCookies());

  return (
    <WorkspacePage
      title={t.formatMessage({ defaultMessage: "Template, header and style" })}
      chat={<WritingSettings />}
    />
  );
}
