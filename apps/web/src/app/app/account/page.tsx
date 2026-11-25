import { auth } from "@clerk/nextjs/server";

import { getTranslation } from "@repo/intl/get-translation";

import { PrivacyAndData } from "~/domains/account/components/privacy-and-data";
import { WorkspacePage } from "~/domains/workspace/components/workspace-page";
import { getLocaleFromNextCookies } from "~/tools/intl/utils/get-locale-from-next-cookies";

export default async function AccountPage() {
  await auth.protect();
  const t = await getTranslation(await getLocaleFromNextCookies());

  return (
    <WorkspacePage
      title={t.formatMessage({ defaultMessage: "Privacy and data" })}
      chat={<PrivacyAndData />}
    />
  );
}
