import { getTranslation } from "@repo/intl/get-translation";

import { ChatPlaceholder } from "~/domains/workspace/components/chat-placeholder";
import { WorkspacePage } from "~/domains/workspace/components/workspace-page";
import { getLocaleFromNextCookies } from "~/tools/intl/utils/get-locale-from-next-cookies";

export default async function NewOpeningPage() {
  const t = await getTranslation(await getLocaleFromNextCookies());

  return (
    <WorkspacePage
      title={t.formatMessage({ defaultMessage: "New opening" })}
      chat={
        <ChatPlaceholder
          heading={t.formatMessage({ defaultMessage: "Add an opening" })}
          description={t.formatMessage({
            defaultMessage:
              "Paste an opening or its link to see right away whether it fits your career.",
          })}
        />
      }
    />
  );
}
