import { redirect } from "next/navigation";

import { getTranslation } from "@repo/intl/get-translation";

import { StartChoice } from "~/domains/career/components/start-choice";
import { startDestination } from "~/domains/career/utils/start-destination";
import { WorkspacePage } from "~/domains/workspace/components/workspace-page";
import { getLocaleFromNextCookies } from "~/tools/intl/utils/get-locale-from-next-cookies";
import { caller } from "~/tools/trpc/server";

export default async function StartPage() {
  // Decided here, so someone who has started never sees a blank screen.
  const destination = startDestination(await caller.career.startState({}));
  if (destination) redirect(destination);
  const t = await getTranslation(await getLocaleFromNextCookies());

  return (
    <WorkspacePage
      title={t.formatMessage({ defaultMessage: "Welcome" })}
      chat={<StartChoice />}
    />
  );
}
