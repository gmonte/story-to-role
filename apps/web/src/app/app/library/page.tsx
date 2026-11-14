import { getTranslation } from "@repo/intl/get-translation";

import { ChatPlaceholder } from "~/domains/workspace/components/chat-placeholder";
import { WorkspacePage } from "~/domains/workspace/components/workspace-page";
import { getLocaleFromNextCookies } from "~/tools/intl/utils/get-locale-from-next-cookies";

export default async function LibraryPage() {
  const t = await getTranslation(await getLocaleFromNextCookies());

  return (
    <WorkspacePage
      title={t.formatMessage({ defaultMessage: "Library" })}
      chat={
        <ChatPlaceholder
          heading={t.formatMessage({ defaultMessage: "Library" })}
          description={t.formatMessage({
            defaultMessage:
              "Resumes and cover letters with no company behind them, listed by their focus.",
          })}
        />
      }
    />
  );
}
