"use client";

import { useEffect, useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";

import { useTRPC } from "~/tools/trpc/client";

const POLL_INTERVAL_MS = 1000;
const TIMEOUT_MS = 30_000;

/**
 * Shown in place of the workspace while the Clerk webhook hasn't created the
 * local user yet (a fresh sign-up gets here first): it polls until the
 * account exists, then renders the page that was asked for.
 */
export function AccountPreparing() {
  const t = useTranslation();
  const trpc = useTRPC();
  const router = useRouter();
  const [timedOut, setTimedOut] = useState(false);

  const { data, refetch } = useQuery({
    ...trpc.users.accountReady.queryOptions({}),
    enabled: !timedOut,
    refetchInterval: (query) =>
      query.state.data?.ready ? false : POLL_INTERVAL_MS,
    staleTime: 0,
    gcTime: 0,
  });
  const ready = data?.ready ?? false;

  useEffect(() => {
    if (ready) router.refresh();
  }, [ready, router]);

  // Give up after a while in case the webhook never lands; retrying re-arms.
  useEffect(() => {
    if (ready || timedOut) return;
    const timeout = setTimeout(() => setTimedOut(true), TIMEOUT_MS);
    return () => clearTimeout(timeout);
  }, [ready, timedOut]);

  return (
    <main className="flex min-h-svh w-full flex-col items-center justify-center gap-4 p-8 text-center">
      {timedOut ? (
        <>
          <p className="text-muted-foreground text-sm text-balance">
            {t.formatMessage({
              defaultMessage:
                "Setting up your account is taking longer than expected. Try again in a moment.",
            })}
          </p>
          <Button
            onClick={() => {
              setTimedOut(false);
              void refetch();
            }}
          >
            {t.formatMessage({ defaultMessage: "Try again" })}
          </Button>
        </>
      ) : (
        <>
          <Loader2 className="text-muted-foreground size-5 animate-spin" />
          <p className="text-muted-foreground text-sm text-balance">
            {t.formatMessage({
              defaultMessage: "We're setting up your account…",
            })}
          </p>
        </>
      )}
    </main>
  );
}
