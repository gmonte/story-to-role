"use client";

import { useQuery } from "@tanstack/react-query";

import { useTranslation } from "@repo/intl/use-translation";

import { useTRPC } from "~/tools/trpc/client";

export function CurrentUserPanel() {
  const t = useTranslation();
  const trpc = useTRPC();

  const me = useQuery(trpc.users.me.queryOptions());

  if (me.isLoading) {
    return <p>{t.formatMessage({ defaultMessage: "Loading…" })}</p>;
  }

  if (me.error || !me.data) {
    return (
      <p className="text-destructive">
        {t.formatMessage({
          defaultMessage:
            "Your user record hasn't been synced yet. Try again in a moment.",
        })}
      </p>
    );
  }

  const user = me.data;

  return (
    <div className="flex flex-col gap-4 text-sm">
      <div>
        <p className="font-semibold">{user.fullName || user.email}</p>
        <p className="text-muted-foreground">{user.email}</p>
      </div>
    </div>
  );
}
