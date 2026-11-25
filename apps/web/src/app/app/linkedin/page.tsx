import { auth } from "@clerk/nextjs/server";

import { getTranslation } from "@repo/intl/get-translation";

import { LinkedinBody } from "~/domains/documents/components/linkedin-page";
import { WorkspacePage } from "~/domains/workspace/components/workspace-page";
import { getLocaleFromNextCookies } from "~/tools/intl/utils/get-locale-from-next-cookies";

export default async function LinkedinPage() {
  await auth.protect();
  const t = await getTranslation(await getLocaleFromNextCookies());

  return (
    <WorkspacePage
      title={t.formatMessage({ defaultMessage: "LinkedIn" })}
      body={<LinkedinBody />}
    />
  );
}
