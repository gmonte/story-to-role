import { getTranslation } from "@repo/intl/get-translation";

import { CareerWorkspaceProvider } from "~/domains/career/components/career-workspace-context";
import { InterviewColumn } from "~/domains/career/components/interview-column";
import { SourcePreview } from "~/domains/career/components/source-preview";
import { TimelinePanel } from "~/domains/career/components/timeline-panel";
import { WorkspacePage } from "~/domains/workspace/components/workspace-page";
import { getLocaleFromNextCookies } from "~/tools/intl/utils/get-locale-from-next-cookies";

export default async function CareerPage() {
  const t = await getTranslation(await getLocaleFromNextCookies());

  return (
    <CareerWorkspaceProvider>
      <WorkspacePage
        title={t.formatMessage({ defaultMessage: "My career" })}
        chat={<InterviewColumn />}
        panel={<TimelinePanel />}
        preview={<SourcePreview />}
      />
    </CareerWorkspaceProvider>
  );
}
