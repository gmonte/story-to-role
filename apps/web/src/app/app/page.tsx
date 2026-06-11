import { UserButton } from "@clerk/nextjs";

import { getTranslation } from "@repo/intl/get-translation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/web/components/ui/card";

import { CurrentUserPanel } from "~/components/current-user-panel";
import { getLocaleFromNextCookies } from "~/tools/intl/utils/get-locale-from-next-cookies";

export default async function AppPage() {
  const locale = await getLocaleFromNextCookies();
  const t = await getTranslation(locale);

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 p-6">
      <Card className="w-full max-w-xl">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>
            {t.formatMessage({ defaultMessage: "Dashboard" })}
          </CardTitle>
          <UserButton />
        </CardHeader>
        <CardContent>
          <CurrentUserPanel />
        </CardContent>
      </Card>
    </main>
  );
}
