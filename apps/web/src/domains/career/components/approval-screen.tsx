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
import { useRefreshCareer } from "../hooks/use-career-queries";
import { useCareerWorkspace } from "./career-workspace-context";

type Decision = { approved: boolean; text?: string };

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
          const text =
            decision.text ??
            draft.text ??
            (draft.story
              ? `${draft.story.problem} → ${draft.story.action} → ${draft.story.result}`
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
                  {draft.lowDetail && (
                    <Badge variant="outline">
                      {t.formatMessage({ defaultMessage: "Low detail" })}
                    </Badge>
                  )}
                </div>
                {editing === draft.id && !draft.story ? (
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
                    disabled={!!draft.story}
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
