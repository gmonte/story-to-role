"use client";

import { useState } from "react";

import { useMutation, useQuery } from "@tanstack/react-query";

import {
  sensitivityChoiceSchema,
  type SensitivityChoice,
} from "@repo/api/domains/evidence/schemas/evidence";
import { useTranslation } from "@repo/intl/use-translation";
import { Badge } from "@repo/web/components/ui/badge";
import { Button } from "@repo/web/components/ui/button";
import { Input } from "@repo/web/components/ui/input";
import { toast } from "@repo/web/components/ui/sonner";

import { useTRPC } from "~/tools/trpc/client";

import { useCareerLabels } from "../hooks/use-career-labels";
import { useRefreshCareer } from "../hooks/use-career-queries";

/**
 * The sensitive-data review: for each flagged name or figure, use it,
 * generalize it (replaced by a description the user writes, which it needs
 * first) or exclude it. Code applies the choice before and after every AI
 * call.
 */
export function SensitiveReview() {
  const t = useTranslation();
  const labels = useCareerLabels();
  const trpc = useTRPC();
  const refresh = useRefreshCareer();
  const items = useQuery(trpc.interview.sensitiveItems.queryOptions({}));
  const [generalized, setGeneralized] = useState<Record<string, string>>({});
  const setChoice = useMutation(
    trpc.interview.setSensitiveChoice.mutationOptions({
      onSuccess: refresh,
      onError: (error) => toast.error(error.message),
    })
  );

  if (!items.data?.length) return null;

  const choose = (
    sensitiveItemId: string,
    choice: SensitivityChoice,
    fallback: string | null
  ) =>
    setChoice.mutate({
      sensitiveItemId,
      choice,
      generalized:
        choice === "generalize"
          ? (generalized[sensitiveItemId] ?? fallback ?? undefined)
          : undefined,
    });

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">
        {t.formatMessage({ defaultMessage: "Names and figures" })}
      </h3>
      <p className="text-muted-foreground text-xs">
        {t.formatMessage({
          defaultMessage:
            "Choose how each one may appear in what StoryToRole writes for you. Use: as it is. Generalize: replaced by the description you write (“a large industrial machinery maker”). Exclude: never appears.",
        })}
      </p>
      {items.data.map((item) => {
        // Generalizing needs the description that will stand in for it.
        const description = (
          generalized[item.id] ??
          item.generalized ??
          ""
        ).trim();
        return (
          <div
            key={item.id}
            className="bg-background flex flex-col gap-2 rounded-lg border p-3"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{item.original}</span>
              <Badge variant="secondary">
                {labels.sensitiveKind(item.kind)}
              </Badge>
              {!item.reviewed && (
                <Badge variant="outline">
                  {t.formatMessage({ defaultMessage: "To review" })}
                </Badge>
              )}
            </div>
            <Input
              placeholder={t.formatMessage({
                defaultMessage: "How to describe it without the name",
              })}
              defaultValue={item.generalized ?? ""}
              onChange={(event) =>
                setGeneralized((current) => ({
                  ...current,
                  [item.id]: event.target.value,
                }))
              }
            />
            <div className="flex gap-1.5">
              {sensitivityChoiceSchema.options.map((choice) => (
                <Button
                  key={choice}
                  size="sm"
                  className="h-7"
                  variant={
                    item.choice === choice && item.reviewed
                      ? "default"
                      : "outline"
                  }
                  disabled={choice === "generalize" && !description}
                  title={
                    choice === "generalize" && !description
                      ? t.formatMessage({
                          defaultMessage:
                            "Write above how to describe it without the name first.",
                        })
                      : undefined
                  }
                  onClick={() => choose(item.id, choice, item.generalized)}
                >
                  {labels.sensitiveChoice(choice)}
                </Button>
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}
