import { Suspense, type ReactNode } from "react";

import { auth } from "@clerk/nextjs/server";

import { getTranslation } from "@repo/intl/get-translation";

import { OpeningsOverview } from "~/domains/applications/components/openings-overview";
import { WorkspacePage } from "~/domains/workspace/components/workspace-page";
import { getLocaleFromNextCookies } from "~/tools/intl/utils/get-locale-from-next-cookies";

export default async function OpeningsOverviewLayout({
  children,
}: {
  children: ReactNode;
}) {
  await auth.protect();
  const t = await getTranslation(await getLocaleFromNextCookies());

  return (
    <WorkspacePage
      title={t.formatMessage({ defaultMessage: "Openings" })}
      chat={
        <Suspense>
          <OpeningsOverview>{children}</OpeningsOverview>
        </Suspense>
      }
    />
  );
}
