import { env } from "@repo/common/env/web.env";
import { getTranslation } from "@repo/intl/get-translation";

import { SampleTaskCard } from "~/domains/tasks/components/sample-task-card";
import { ChatPlaceholder } from "~/domains/workspace/components/chat-placeholder";
import { WorkspacePage } from "~/domains/workspace/components/workspace-page";
import { getLocaleFromNextCookies } from "~/tools/intl/utils/get-locale-from-next-cookies";

export default async function CareerPage() {
  const t = await getTranslation(await getLocaleFromNextCookies());

  return (
    <WorkspacePage
      title={t.formatMessage({ defaultMessage: "My career" })}
      chat={
        <ChatPlaceholder
          heading={t.formatMessage({ defaultMessage: "Your career story" })}
          description={t.formatMessage({
            defaultMessage:
              "The guided interview will go through your positions one at a time and turn what you tell it into evidence you approve.",
          })}
        />
      }
      panel={
        <div className="flex flex-col gap-4">
          <section className="flex flex-col gap-1">
            <h2 className="text-sm font-medium">
              {t.formatMessage({ defaultMessage: "Timeline" })}
            </h2>
            <p className="text-muted-foreground text-xs">
              {t.formatMessage({
                defaultMessage:
                  "Your positions will appear here as you add them.",
              })}
            </p>
          </section>
          {env.NEXT_PUBLIC_ENV !== "production" && <SampleTaskCard />}
        </div>
      }
    />
  );
}
