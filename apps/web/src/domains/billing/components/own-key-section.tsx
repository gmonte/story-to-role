"use client";

import { useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, KeyRound } from "lucide-react";

import { useTranslation } from "@repo/intl/use-translation";
import { Badge } from "@repo/web/components/ui/badge";
import { Button } from "@repo/web/components/ui/button";
import { Input } from "@repo/web/components/ui/input";
import { Label } from "@repo/web/components/ui/label";
import { toast } from "@repo/web/components/ui/sonner";

import { useTRPC } from "~/tools/trpc/client";

/**
 * The user's own key (billing spec, "Plans and AI funding": a funding
 * mode of the paid plan). Saved only once a minimal call proves it works;
 * never shown again but for its last characters.
 */
export function OwnKeySection({ paidPlan }: { paidPlan: boolean }) {
  const t = useTranslation();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const key = useQuery(trpc.aiKeys.get.queryOptions({}));
  const [apiKey, setApiKey] = useState("");
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: trpc.aiKeys.pathKey() }),
      queryClient.invalidateQueries({ queryKey: trpc.credits.pathKey() }),
    ]);
  const keyError = (error: {
    message: string;
    data?: { aiKey?: string | null } | null;
  }) =>
    toast.error(
      error.data?.aiKey === "refused"
        ? t.formatMessage({
            defaultMessage:
              "Anthropic refused this key. Check it and try again.",
          })
        : error.message
    );
  const noCredit = () =>
    toast.warning(
      t.formatMessage({
        defaultMessage:
          "Saved, but this key has no credit left. Add credit in the Anthropic Console, or check it again once it renews.",
      })
    );
  const save = useMutation(
    trpc.aiKeys.save.mutationOptions({
      onSuccess: async ({ status }) => {
        setApiKey("");
        await refresh();
        if (status === "out_of_credit") noCredit();
        else toast.success(t.formatMessage({ defaultMessage: "Key saved." }));
      },
      onError: keyError,
    })
  );
  const recheck = useMutation(
    trpc.aiKeys.recheck.mutationOptions({
      onSuccess: async ({ status }) => {
        await refresh();
        if (status === "active") {
          toast.success(t.formatMessage({ defaultMessage: "Your key works." }));
        }
      },
      onError: keyError,
    })
  );
  const remove = useMutation(
    trpc.aiKeys.remove.mutationOptions({
      onSuccess: refresh,
      onError: (error) => toast.error(error.message),
    })
  );
  const saved = key.data;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h2 className="font-medium">
          {t.formatMessage({ defaultMessage: "Your own API key" })}
        </h2>
        <Badge variant="outline" className="gap-1">
          <BadgeCheck className="size-3.5" />
          {t.formatMessage({ defaultMessage: "Anthropic · certified" })}
        </Badge>
      </div>
      <p className="text-muted-foreground">
        {t.formatMessage({
          defaultMessage:
            "With your own Anthropic key, your AI calls are paid by it instead of credits. A key from a Console organization linked to Claude Max or Team uses that plan’s monthly API credits. StoryToRole picks the model for each step.",
        })}
      </p>

      {!paidPlan ? (
        <p className="rounded-lg border border-dashed p-3">
          {t.formatMessage({
            defaultMessage:
              "Your own key comes with the paid plan: the subscription or a courtesy plan.",
          })}
        </p>
      ) : saved ? (
        <div className="flex flex-col gap-2 rounded-lg border p-4">
          <span className="flex items-center gap-2">
            <KeyRound className="size-4" />
            {t.formatMessage(
              { defaultMessage: "Key ending in {characters}" },
              { characters: saved.lastCharacters }
            )}
          </span>
          {saved.status !== "active" && (
            <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs">
              {saved.status === "out_of_credit"
                ? t.formatMessage({
                    defaultMessage:
                      "Your key ran out of credit, so the task that used it stopped and nothing was charged. If it renews monthly (Claude Max or Team), it works again on the renewal date; check it again then, or finish with credits.",
                  })
                : t.formatMessage({
                    defaultMessage:
                      "Anthropic refused your key, so the task that used it stopped and nothing was charged. Save a new key, or finish with credits.",
                  })}
            </p>
          )}
          <div className="flex gap-2">
            {saved.status !== "active" && (
              <Button
                size="sm"
                variant="outline"
                disabled={recheck.isPending}
                onClick={() => recheck.mutate({})}
              >
                {t.formatMessage({ defaultMessage: "Check again" })}
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              disabled={remove.isPending}
              onClick={() => remove.mutate({})}
            >
              {t.formatMessage({ defaultMessage: "Remove key" })}
            </Button>
          </div>
        </div>
      ) : null}

      {paidPlan && (
        <form
          className="flex flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate({ apiKey });
          }}
        >
          <div className="grid flex-1 gap-1.5">
            <Label htmlFor="own-api-key">
              {saved
                ? t.formatMessage({ defaultMessage: "Replace with a new key" })
                : t.formatMessage({ defaultMessage: "Anthropic API key" })}
            </Label>
            <Input
              id="own-api-key"
              type="password"
              autoComplete="off"
              placeholder="sk-ant-…"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
            />
          </div>
          <Button type="submit" disabled={save.isPending || apiKey.length < 20}>
            {t.formatMessage({ defaultMessage: "Check and save" })}
          </Button>
        </form>
      )}
    </section>
  );
}
