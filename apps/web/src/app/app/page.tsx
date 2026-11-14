import { SignOutButton, UserButton } from "@clerk/nextjs";

import { getTranslation } from "@repo/intl/get-translation";
import { Button } from "@repo/web/components/ui/button";
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
          <div className="flex items-center gap-2">
            {/* Temporary: explicit sign-out until the app shell exists. */}
            <SignOutButton redirectUrl="/">
              <Button variant="outline" size="sm">
                {t.formatMessage({ defaultMessage: "Sign out" })}
              </Button>
            </SignOutButton>
            <UserButton />
          </div>
        </CardHeader>
        <CardContent>
          <CurrentUserPanel />
        </CardContent>
      </Card>
    </main>
  );
}
