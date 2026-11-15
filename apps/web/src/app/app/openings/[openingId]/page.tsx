import { getTranslation } from "@repo/intl/get-translation";

import { FitCheckPanel } from "~/domains/openings/components/fit-check-panel";
import { OpeningView } from "~/domains/openings/components/opening-view";
import { WorkspacePage } from "~/domains/workspace/components/workspace-page";
import { getLocaleFromNextCookies } from "~/tools/intl/utils/get-locale-from-next-cookies";

export default async function OpeningPage({
  params,
}: {
  params: Promise<{ openingId: string }>;
}) {
  const { openingId } = await params;
  const t = await getTranslation(await getLocaleFromNextCookies());

  return (
    <WorkspacePage
      title={t.formatMessage({ defaultMessage: "Opening" })}
      chat={<OpeningView openingId={openingId} />}
      panel={<FitCheckPanel openingId={openingId} />}
    />
  );
}
