"use client";

import { useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";

import type { ApplicationOverrideItem } from "@repo/api/domains/applications/schemas/overrides";
import {
  type SensitivityChoice,
  sensitivityChoiceSchema,
} from "@repo/api/domains/evidence/schemas/evidence";
import { useTranslation } from "@repo/intl/use-translation";
import { Badge } from "@repo/web/components/ui/badge";
import { Button } from "@repo/web/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@repo/web/components/ui/collapsible";
import { Input } from "@repo/web/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/web/components/ui/select";
import { toast } from "@repo/web/components/ui/sonner";

import { useCareerLabels } from "~/domains/career/hooks/use-career-labels";
import { useTRPC } from "~/tools/trpc/client";

const asUsual = "as_usual";

/** What an item does in this application: its own choice, or the general one. */
const effective = (item: ApplicationOverrideItem) =>
  item.override?.choice ?? item.choice ?? "use";

function useOverrides(openingId: string) {
  const trpc = useTRPC();
  return useQuery(trpc.overrides.list.queryOptions({ openingId }));
}

/**
 * The reminder before generating (guided interview spec, "Per-application
 * overrides"): the names and figures that will appear as they are, and,
 * for this application only, the choice to keep, generalize or exclude
 * each sensitive item.
 */
export function SensitiveOverrides({ openingId }: { openingId: string }) {
  const t = useTranslation();
  const overrides = useOverrides(openingId);
  const items = overrides.data ?? [];
  if (items.length === 0) return null;
  const shown = items.filter((item) => effective(item) === "use");

  return (
    <Collapsible>
      <CollapsibleTrigger className="text-muted-foreground flex items-center gap-1 text-left text-xs hover:underline">
        <ChevronDown className="size-3.5 shrink-0" />
        {shown.length > 0
          ? t.formatMessage(
              {
                defaultMessage:
                  "Names and figures in this application: {names} appear as they are",
              },
              { names: shown.map((item) => item.original).join(", ") }
            )
          : t.formatMessage({
              defaultMessage: "Names and figures in this application",
            })}
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 grid gap-2">
        {items.map((item) => (
          <OverrideRow
            key={item.sensitiveItemId}
            openingId={openingId}
            item={item}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

/** The Context block's list: the items this application treats its own way. */
export function ActiveOverrides({ openingId }: { openingId: string }) {
  const t = useTranslation();
  const overrides = useOverrides(openingId);
  const active = (overrides.data ?? []).filter((item) => item.override);
  if (active.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1 text-xs">
      {active.map((item) => (
        <li key={item.sensitiveItemId}>
          {
            {
              use: t.formatMessage(
                { defaultMessage: "{name} appears as it is here" },
                { name: item.original }
              ),
              generalize: t.formatMessage(
                { defaultMessage: "{name} is generalized here" },
                { name: item.original }
              ),
              exclude: t.formatMessage(
                { defaultMessage: "{name} is left out here" },
                { name: item.original }
              ),
            }[effective(item)]
          }
        </li>
      ))}
    </ul>
  );
}

function OverrideRow({
  openingId,
  item,
}: {
  openingId: string;
  item: ApplicationOverrideItem;
}) {
  const t = useTranslation();
  const labels = useCareerLabels();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [wording, setWording] = useState<string | null>(null);
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: trpc.overrides.pathKey() });
  const onError = (error: { message: string }) => toast.error(error.message);
  const set = useMutation(
    trpc.overrides.set.mutationOptions({
      onSuccess: async () => {
        setWording(null);
        await refresh();
      },
      onError,
    })
  );
  const remove = useMutation(
    trpc.overrides.remove.mutationOptions({ onSuccess: refresh, onError })
  );
  const general = labels.sensitiveChoice(item.choice ?? "use");

  const choose = (value: string) => {
    if (value === asUsual) {
      remove.mutate({ openingId, sensitiveItemId: item.sensitiveItemId });
      return;
    }
    const choice = value as SensitivityChoice;
    // Generalizing needs a wording when the item has none of its own.
    if (choice === "generalize" && !item.generalized) {
      setWording("");
      return;
    }
    set.mutate({ openingId, sensitiveItemId: item.sensitiveItemId, choice });
  };

  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate">{item.original}</span>
          <Badge variant="outline">{labels.sensitiveKind(item.kind)}</Badge>
        </span>
        <Select value={item.override?.choice ?? asUsual} onValueChange={choose}>
          <SelectTrigger size="sm" className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={asUsual}>
              {t.formatMessage(
                { defaultMessage: "As usual ({choice})" },
                { choice: general.toLowerCase() }
              )}
            </SelectItem>
            {sensitivityChoiceSchema.options.map((choice) => (
              <SelectItem key={choice} value={choice}>
                {labels.sensitiveChoice(choice)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {wording !== null && (
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            set.mutate({
              openingId,
              sensitiveItemId: item.sensitiveItemId,
              choice: "generalize",
              generalized: wording,
            });
          }}
        >
          <Input
            autoFocus
            maxLength={300}
            value={wording}
            placeholder={t.formatMessage({
              defaultMessage: "How it should read here (a large private bank…)",
            })}
            onChange={(event) => setWording(event.target.value)}
          />
          <Button
            size="sm"
            type="submit"
            disabled={set.isPending || !wording.trim()}
          >
            {t.formatMessage({ defaultMessage: "Save" })}
          </Button>
        </form>
      )}
    </div>
  );
}
