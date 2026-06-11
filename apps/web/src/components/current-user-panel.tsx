"use client";

import { useQuery } from "@tanstack/react-query";

import { useTranslation } from "@repo/intl/use-translation";

import { useTRPC } from "~/tools/trpc/client";

export function CurrentUserPanel() {
  const t = useTranslation();
  const trpc = useTRPC();

  const me = useQuery(trpc.users.me.queryOptions());
  const myOrgs = useQuery(trpc.users.myOrganizations.queryOptions());

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
  const orgs = myOrgs.data ?? [];

  return (
    <div className="flex flex-col gap-4 text-sm">
      <div>
        <p className="font-semibold">{user.fullName || user.email}</p>
        <p className="text-muted-foreground">{user.email}</p>
      </div>

      <div>
        <p className="mb-1 font-semibold">
          {t.formatMessage({ defaultMessage: "Organizations" })}
        </p>
        {orgs.length === 0 ? (
          <p className="text-muted-foreground">
            {t.formatMessage({
              defaultMessage: "You don't belong to any organization yet.",
            })}
          </p>
        ) : (
          <ul className="list-disc pl-5">
            {orgs.map((org) => (
              <li key={org.id}>
                {org.name}{" "}
                <span className="text-muted-foreground">({org.clerkRole})</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
