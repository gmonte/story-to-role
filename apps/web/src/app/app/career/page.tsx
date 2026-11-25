import { auth } from "@clerk/nextjs/server";

import { getTranslation } from "@repo/intl/get-translation";

import { CareerWorkspaceProvider } from "~/domains/career/components/career-workspace-context";
import { CareerBody } from "~/domains/career/components/career-body";
import { WorkspacePage } from "~/domains/workspace/components/workspace-page";
import { getLocaleFromNextCookies } from "~/tools/intl/utils/get-locale-from-next-cookies";

export default async function CareerPage() {
  await auth.protect();
  const t = await getTranslation(await getLocaleFromNextCookies());

  return (
    <CareerWorkspaceProvider>
      <WorkspacePage
        title={t.formatMessage({ defaultMessage: "My career" })}
        body={<CareerBody />}
      />
    </CareerWorkspaceProvider>
  );
}
