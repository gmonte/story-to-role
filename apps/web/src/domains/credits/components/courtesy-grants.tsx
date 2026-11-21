"use client";

import { useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useTranslation } from "@repo/intl/use-translation";
import { Badge } from "@repo/web/components/ui/badge";
import { Button } from "@repo/web/components/ui/button";
import { Input } from "@repo/web/components/ui/input";
import { Label } from "@repo/web/components/ui/label";
import { toast } from "@repo/web/components/ui/sonner";

import { useTRPC } from "~/tools/trpc/client";

/**
 * The owner's courtesy grants (billing spec, "Courtesy plan"): the paid
 * plan without a subscription, with monthly courtesy credits (zero
 * allowed) and an optional end date. Only admins reach it.
 */
export function CourtesyGrants() {
  const t = useTranslation();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const grants = useQuery(trpc.credits.listCourtesyGrants.queryOptions({}));
  const [email, setEmail] = useState("");
  const [monthlyCredits, setMonthlyCredits] = useState("0");
  const [endsOn, setEndsOn] = useState("");
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: trpc.credits.pathKey() });
  const onError = (error: { message: string }) => toast.error(error.message);
  const grant = useMutation(
    trpc.credits.grantCourtesy.mutationOptions({
      onSuccess: async () => {
        setEmail("");
        setEndsOn("");
        await refresh();
      },
      onError,
    })
  );
  const end = useMutation(
    trpc.credits.endCourtesy.mutationOptions({ onSuccess: refresh, onError })
  );

  if (grants.error) {
    return (
      <p className="text-muted-foreground p-6 text-sm">
        {t.formatMessage({ defaultMessage: "This page is for admins only." })}
      </p>
    );
  }

  return (
    <div className="w-full overflow-y-auto">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium">
            {t.formatMessage({ defaultMessage: "Courtesy grants" })}
          </h2>
          <p className="text-muted-foreground text-sm">
            {t.formatMessage({
              defaultMessage:
                "The paid plan without a subscription. A new grant replaces the user’s current one; when it ends, they return to Free.",
            })}
          </p>
          <form
            className="bg-card grid gap-3 rounded-lg border p-4 sm:grid-cols-[1fr_8rem_10rem_auto] sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              grant.mutate({
                email,
                monthlyCredits: Number(monthlyCredits),
                endsAt: endsOn ? new Date(`${endsOn}T00:00:00`) : null,
              });
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="courtesy-email">
                {t.formatMessage({ defaultMessage: "User’s email" })}
              </Label>
              <Input
                id="courtesy-email"
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="courtesy-credits">
                {t.formatMessage({ defaultMessage: "Credits a month" })}
              </Label>
              <Input
                id="courtesy-credits"
                type="number"
                min={0}
                required
                value={monthlyCredits}
                onChange={(event) => setMonthlyCredits(event.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="courtesy-ends">
                {t.formatMessage({ defaultMessage: "Ends on (optional)" })}
              </Label>
              <Input
                id="courtesy-ends"
                type="date"
                value={endsOn}
                onChange={(event) => setEndsOn(event.target.value)}
              />
            </div>
            <Button type="submit" disabled={grant.isPending}>
              {t.formatMessage({ defaultMessage: "Grant" })}
            </Button>
          </form>
        </section>

        <ul className="grid gap-2">
          {(grants.data ?? []).map((row) => {
            return (
              <li
                key={row.id}
                className="bg-card flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm"
              >
                <span className="flex flex-col">
                  <span className="font-medium">
                    {row.fullName ? row.fullName : row.email}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {row.endsAt
                      ? t.formatMessage(
                          {
                            defaultMessage:
                              "{email} · {credits, number} credits a month · until {date}",
                          },
                          {
                            email: row.email,
                            credits: row.monthlyCredits,
                            date: t.formatDate(row.endsAt, {
                              dateStyle: "medium",
                            }),
                          }
                        )
                      : t.formatMessage(
                          {
                            defaultMessage:
                              "{email} · {credits, number} credits a month",
                          },
                          { email: row.email, credits: row.monthlyCredits }
                        )}
                  </span>
                </span>
                {row.active ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={end.isPending}
                    onClick={() => end.mutate({ courtesyGrantId: row.id })}
                  >
                    {t.formatMessage({ defaultMessage: "End now" })}
                  </Button>
                ) : (
                  <Badge variant="outline">
                    {t.formatMessage({ defaultMessage: "Ended" })}
                  </Badge>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
