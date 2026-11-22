import { auth } from "@clerk/nextjs/server";

import { getTranslation } from "@repo/intl/get-translation";

import { OpeningBody } from "~/domains/openings/components/opening-panel";
import { WorkspacePage } from "~/domains/workspace/components/workspace-page";
import { getLocaleFromNextCookies } from "~/tools/intl/utils/get-locale-from-next-cookies";

export default async function OpeningPage({
  params,
}: {
  params: Promise<{ openingId: string }>;
}) {
  await auth.protect();
  const { openingId } = await params;
  const t = await getTranslation(await getLocaleFromNextCookies());

  return (
    <WorkspacePage
      title={t.formatMessage({ defaultMessage: "Opening" })}
      body={<OpeningBody openingId={openingId} />}
    />
  );
}
