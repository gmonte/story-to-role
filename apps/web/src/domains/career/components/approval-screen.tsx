"use client";

import { useState } from "react";

import { useMutation } from "@tanstack/react-query";
import { Check, FileText, Quote, X } from "lucide-react";

import type { SessionView } from "@repo/api/domains/interview/schemas/session-view";
import { useTranslation } from "@repo/intl/use-translation";
import { Badge } from "@repo/web/components/ui/badge";
import { Button } from "@repo/web/components/ui/button";
import { toast } from "@repo/web/components/ui/sonner";
import { Textarea } from "@repo/web/components/ui/textarea";
import { cn } from "@repo/web/lib/utils";

import { useTRPC } from "~/tools/trpc/client";

import { useCareerLabels } from "../hooks/use-career-labels";
import { useRefreshCareer, useTimeline } from "../hooks/use-career-queries";
import { useCareerWorkspace } from "./career-workspace-context";
import { LanguageBadges } from "./language-badges";

type StoryFields = {
  problem: string;
  action: string;
  partners?: string;
  result: string;
};
type Decision = { approved: boolean; text?: string; story?: StoryFields };

/**
 * The extraction is a proposal: each extracted line sits beside the user's
 * own words, and nothing reaches the evidence base until the user approves
 * it here (guided interview spec, principle 3).
 */
export function ApprovalScreen({ session }: { session: SessionView }) {
  const t = useTranslation();
  const labels = useCareerLabels();
  const trpc = useTRPC();
  const refresh = useRefreshCareer();
  const { setActiveSessionId } = useCareerWorkspace();
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const timeline = useTimeline();
  const bilingual =
    new Set([
      ...(timeline.data?.evidenceLanguages ?? []),
      ...session.drafts.map((draft) => draft.language),
    ]).size > 1;

  const decisionOf = (draftId: string): Decision =>
    decisions[draftId] ?? { approved: true };
  const setDecision = (draftId: string, decision: Partial<Decision>) =>
    setDecisions((current) => ({
      ...current,
      [draftId]: { ...decisionOf(draftId), ...decision },
    }));

  const approve = useMutation(
    trpc.interview.approveExtraction.mutationOptions({
      onSuccess: async ({ nextSessionId }) => {
        await refresh();
        setActiveSessionId(nextSessionId);
        toast.success(
          t.formatMessage({ defaultMessage: "Saved to your career." })
        );
      },
      onError: (error) => toast.error(error.message),
    })
  );

  const submit = (closePosition: boolean) =>
    approve.mutate({
      sessionId: session.id,
      closePosition,
      decisions: session.drafts.map((draft) => ({
        draftId: draft.id,
        ...decisionOf(draft.id),
      })),
    });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6">
      <div>
        <h2 className="font-display text-xl font-semibold tracking-tight">
          {t.formatMessage({ defaultMessage: "Review what was recorded" })}
        </h2>
        <p className="text-muted-foreground text-sm">
          {t.formatMessage({
            defaultMessage:
              "Each line is shown beside your own words. Edit or discard anything; only what you approve is saved.",
          })}
        </p>
      </div>

      {session.drafts.length === 0 && (
        <p className="text-muted-foreground text-sm">
          {t.formatMessage({
            defaultMessage: "Nothing was recorded in this session yet.",
          })}
        </p>
      )}

      <ol className="flex flex-col gap-3">
        {session.drafts.map((draft) => {
          const decision = decisionOf(draft.id);
          const story = decision.story ?? draft.story;
          const text =
            decision.text ??
            draft.text ??
            (story
              ? `${story.problem} → ${story.action} → ${story.result}`
              : "");
          return (
            <li
              key={draft.id}
              className={cn(
                "grid gap-3 rounded-lg border p-3 sm:grid-cols-2",
                !decision.approved && "opacity-50"
              )}
            >
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">
                    {labels.draftKind(draft.kind)}
                  </Badge>
                  <LanguageBadges
                    languages={[draft.language]}
                    bilingual={bilingual}
                  />
                  {draft.lowDetail && (
                    <Badge variant="outline">
                      {t.formatMessage({ defaultMessage: "Low detail" })}
                    </Badge>
                  )}
                </div>
                {editing === draft.id && draft.story ? (
                  <StoryEditor
                    story={decision.story ?? draft.story}
                    onDone={(story) => {
                      setDecision(draft.id, { story });
                      setEditing(null);
                    }}
                  />
                ) : editing === draft.id ? (
                  <Textarea
                    autoFocus
                    defaultValue={text}
                    onBlur={(event) => {
                      setDecision(draft.id, {
                        text: event.target.value.trim() || undefined,
                      });
                      setEditing(null);
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className="text-left text-sm"
                    onClick={() => setEditing(draft.id)}
                  >
                    {text}
                  </button>
                )}
              </div>
              <div className="bg-muted/50 text-muted-foreground flex gap-2 rounded-md p-2 text-sm">
                {draft.fromDocument ? (
                  <FileText className="mt-0.5 size-4 shrink-0" />
                ) : (
                  <Quote className="mt-0.5 size-4 shrink-0" />
                )}
                <span className="italic">{draft.quote}</span>
              </div>
              <div className="flex gap-2 sm:col-span-2">
                <Button
                  size="sm"
                  variant={decision.approved ? "default" : "outline"}
                  onClick={() => setDecision(draft.id, { approved: true })}
                >
                  <Check />
                  {t.formatMessage({ defaultMessage: "Keep" })}
                </Button>
                <Button
                  size="sm"
                  variant={decision.approved ? "outline" : "default"}
                  onClick={() => setDecision(draft.id, { approved: false })}
                >
                  <X />
                  {t.formatMessage({ defaultMessage: "Discard" })}
                </Button>
              </div>
            </li>
          );
        })}
      </ol>

      {session.flaggedSensitiveItems.length > 0 && (
        <p className="text-muted-foreground text-sm">
          {t.formatMessage(
            {
              defaultMessage:
                "{count, plural, one {# name or figure} other {# names or figures}} will go to the sensitive-data review after you approve.",
            },
            { count: session.flaggedSensitiveItems.length }
          )}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button disabled={approve.isPending} onClick={() => submit(true)}>
          {t.formatMessage({
            defaultMessage: "Approve and close this position",
          })}
        </Button>
        <Button
          variant="outline"
          disabled={approve.isPending}
          onClick={() => submit(false)}
        >
          {t.formatMessage({ defaultMessage: "Approve and keep talking" })}
        </Button>
      </div>
    </div>
  );
}

/** Every item stays editable, a story's problem, action and result included. */
function StoryEditor({
  story,
  onDone,
}: {
  story: StoryFields;
  onDone: (story: StoryFields) => void;
}) {
  const t = useTranslation();
  const [draft, setDraft] = useState(story);
  const fields = [
    { key: "problem", label: t.formatMessage({ defaultMessage: "Problem" }) },
    {
      key: "action",
      label: t.formatMessage({ defaultMessage: "What you did" }),
    },
    {
      key: "partners",
      label: t.formatMessage({ defaultMessage: "With whom" }),
    },
    { key: "result", label: t.formatMessage({ defaultMessage: "Result" }) },
  ] as const;

  return (
    <div className="flex flex-col gap-2">
      {fields.map((field) => (
        <label key={field.key} className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">{field.label}</span>
          <Textarea
            rows={2}
            value={draft[field.key] ?? ""}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                [field.key]: event.target.value,
              }))
            }
          />
        </label>
      ))}
      <Button
        size="sm"
        variant="outline"
        disabled={
          !draft.problem.trim() || !draft.action.trim() || !draft.result.trim()
        }
        onClick={() =>
          onDone({
            problem: draft.problem.trim(),
            action: draft.action.trim(),
            partners: draft.partners?.trim()
              ? draft.partners.trim()
              : undefined,
            result: draft.result.trim(),
          })
        }
      >
        {t.formatMessage({ defaultMessage: "Done" })}
      </Button>
    </div>
  );
}
