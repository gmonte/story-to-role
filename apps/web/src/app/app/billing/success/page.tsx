import { auth } from "@clerk/nextjs/server";

import { getTranslation } from "@repo/intl/get-translation";

import { CheckoutReturn } from "~/domains/billing/components/checkout-return";
import { WorkspacePage } from "~/domains/workspace/components/workspace-page";
import { getLocaleFromNextCookies } from "~/tools/intl/utils/get-locale-from-next-cookies";

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  await auth.protect();
  const t = await getTranslation(await getLocaleFromNextCookies());
  const { session_id: checkoutSessionId } = await searchParams;

  return (
    <WorkspacePage
      title={t.formatMessage({ defaultMessage: "Plan and credits" })}
      chat={<CheckoutReturn checkoutSessionId={checkoutSessionId ?? null} />}
    />
  );
}
