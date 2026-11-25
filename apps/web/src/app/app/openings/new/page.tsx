import { auth } from "@clerk/nextjs/server";

import { getTranslation } from "@repo/intl/get-translation";

import { NewOpeningForm } from "~/domains/openings/components/new-opening-form";
import { WorkspacePage } from "~/domains/workspace/components/workspace-page";
import { getLocaleFromNextCookies } from "~/tools/intl/utils/get-locale-from-next-cookies";

export default async function NewOpeningPage() {
  await auth.protect();
  const t = await getTranslation(await getLocaleFromNextCookies());

  return (
    <WorkspacePage
      title={t.formatMessage({ defaultMessage: "New opening" })}
      chat={<NewOpeningForm />}
    />
  );
}
