import { Show, SignInButton, UserButton } from "@clerk/nextjs";
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

export default async function HomePage() {
  const locale = await getLocaleFromNextCookies();
  const t = await getTranslation(locale);

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 p-6">
      <Card className="w-full max-w-xl">
        <CardHeader>
          <CardTitle className="text-2xl">
            {t.formatMessage({ defaultMessage: "StoryToRole" })}
          </CardTitle>
          <CardDescription>
            {t.formatMessage({
              defaultMessage:
                "Turn your career story into tailored resumes and cover letters.",
            })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-3">
            <Show when="signed-out">
              <SignInButton mode="modal">
                <Button>
                  {t.formatMessage({ defaultMessage: "Sign in" })}
                </Button>
              </SignInButton>
            </Show>
            <Show when="signed-in">
              <Button asChild variant="outline">
                <Link href="/app">
                  {t.formatMessage({ defaultMessage: "Go to dashboard" })}
                </Link>
              </Button>
              <UserButton />
            </Show>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
