import { getTranslation } from "@repo/intl/get-translation";

import { LibraryView } from "~/domains/documents/components/library-view";
import { WorkspacePage } from "~/domains/workspace/components/workspace-page";
import { getLocaleFromNextCookies } from "~/tools/intl/utils/get-locale-from-next-cookies";

export default async function LibraryPage() {
  const t = await getTranslation(await getLocaleFromNextCookies());

  return (
    <WorkspacePage
      title={t.formatMessage({ defaultMessage: "Library" })}
      chat={<LibraryView />}
    />
  );
}
