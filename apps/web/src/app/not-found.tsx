import Link from "next/link";

import { getTranslation } from "@repo/intl/get-translation";
import { Button } from "@repo/web/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/web/components/ui/card";

import { getLocaleFromNextCookies } from "~/tools/intl/utils/get-locale-from-next-cookies";

export default async function NotFoundPage() {
  const locale = await getLocaleFromNextCookies();
  const t = await getTranslation(locale);

  return (
    <main className="bg-background flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">
            {t.formatMessage({ defaultMessage: "Page not found" })}
          </CardTitle>
          <CardDescription>
            {t.formatMessage({
              defaultMessage: "The page you are looking for does not exist.",
            })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full">
            <Link href="/">
              {t.formatMessage({ defaultMessage: "Go home" })}
            </Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
