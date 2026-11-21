"use client";

import { useState } from "react";

import { useMutation } from "@tanstack/react-query";

import type { FitCheckItemView } from "@repo/api/domains/openings/schemas/opening-view";
import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";
import { Checkbox } from "@repo/web/components/ui/checkbox";
import { Label } from "@repo/web/components/ui/label";
import {
  RadioGroup,
  RadioGroupItem,
} from "@repo/web/components/ui/radio-group";
import { toast } from "@repo/web/components/ui/sonner";
import { Textarea } from "@repo/web/components/ui/textarea";

import { useTRPC } from "~/tools/trpc/client";

import { useRefreshOpenings } from "../hooks/use-opening";

type Stance = NonNullable<FitCheckItemView["conditionStance"]>;

/**
 * The answer to a condition requirement (work model, schedule, location,
 * travel…): the user meets it, doesn't but it is not a blocker, or it is a
 * blocker, with an optional note. A blocker can be added to the job
 * preferences. Nothing re-runs: the fit check reads as outdated.
 */
export function ConditionAnswer({
  fitCheckItemId,
  stance,
  note,
}: {
  fitCheckItemId: string;
  stance: FitCheckItemView["conditionStance"];
  note: string | null;
}) {
  const t = useTranslation();
  const trpc = useTRPC();
  const refresh = useRefreshOpenings();
  const [editing, setEditing] = useState(false);
  const [choice, setChoice] = useState<Stance>(stance ?? "meets");
  const [draft, setDraft] = useState(note ?? "");
  const [addToPreferences, setAddToPreferences] = useState(false);

  const options: Array<{ value: Stance; label: string }> = [
    { value: "meets", label: t.formatMessage({ defaultMessage: "I meet it" }) },
    {
      value: "not_blocker",
      label: t.formatMessage({
        defaultMessage: "I don’t meet it, but it’s not a blocker for me",
      }),
    },
    {
      value: "blocker",
      label: t.formatMessage({ defaultMessage: "It’s a blocker for me" }),
    },
  ];

  const save = useMutation(
    trpc.openings.answerCondition.mutationOptions({
      onSuccess: async (result) => {
        await refresh();
        setEditing(false);
        toast.success(
          result.preferenceRule
            ? t.formatMessage({
                defaultMessage:
                  "Noted, and added to your job preferences as a discard rule.",
              })
            : t.formatMessage({ defaultMessage: "Noted for this opening." })
        );
      },
      onError: (error) => toast.error(error.message),
    })
  );
  const undo = useMutation(
    trpc.openings.undoConditionAnswer.mutationOptions({
      onSuccess: async () => {
        await refresh();
        setDraft("");
        setChoice("meets");
        setEditing(false);
      },
      onError: (error) => toast.error(error.message),
    })
  );

  const summary = options.find((option) => option.value === stance)?.label;

  if (stance && !editing) {
    return (
      <div className="flex flex-col gap-1.5 border-t pt-2">
        <p className="flex flex-wrap gap-x-1 text-xs">
          <span className="text-muted-foreground">
            {t.formatMessage({ defaultMessage: "Your answer:" })}
          </span>
          <span className="font-medium">{summary}</span>
          {note && <span className="whitespace-pre-wrap">{note}</span>}
        </p>
        {stance === "blocker" && (
          <p className="text-destructive text-xs font-medium">
            {t.formatMessage({
              defaultMessage:
                "You marked this as a blocker: think twice before applying.",
            })}
          </p>
        )}
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            {t.formatMessage({ defaultMessage: "Edit" })}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={undo.isPending}
            onClick={() => undo.mutate({ fitCheckItemId })}
          >
            {t.formatMessage({ defaultMessage: "Undo" })}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 border-t pt-2">
      <p className="text-sm font-medium">
        {t.formatMessage({ defaultMessage: "How do you stand on this?" })}
      </p>
      <RadioGroup
        value={choice}
        onValueChange={(value) => setChoice(value as Stance)}
        className="gap-1.5"
      >
        {options.map((option) => (
          <div key={option.value} className="flex items-center gap-2">
            <RadioGroupItem
              value={option.value}
              id={`${fitCheckItemId}-${option.value}`}
            />
            <Label
              htmlFor={`${fitCheckItemId}-${option.value}`}
              className="font-normal"
            >
              {option.label}
            </Label>
          </div>
        ))}
      </RadioGroup>
      <Textarea
        rows={2}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={t.formatMessage({
          defaultMessage:
            "Optional note, such as “I can start at 7:00 if needed”",
        })}
      />
      {choice === "blocker" && (
        <div className="flex items-center gap-2">
          <Checkbox
            id={`${fitCheckItemId}-prefs`}
            checked={addToPreferences}
            onCheckedChange={(checked) => setAddToPreferences(checked === true)}
          />
          <Label htmlFor={`${fitCheckItemId}-prefs`} className="font-normal">
            {t.formatMessage({ defaultMessage: "Add to my job preferences" })}
          </Label>
        </div>
      )}
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={save.isPending}
          onClick={() =>
            save.mutate({
              fitCheckItemId,
              stance: choice,
              note: draft.trim() || undefined,
              addToPreferences: choice === "blocker" && addToPreferences,
            })
          }
        >
          {t.formatMessage({ defaultMessage: "Save answer" })}
        </Button>
        {stance && (
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            {t.formatMessage({ defaultMessage: "Cancel" })}
          </Button>
        )}
      </div>
    </div>
  );
}
