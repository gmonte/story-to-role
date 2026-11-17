"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Send, Sparkles } from "lucide-react";

import { useTranslation } from "@repo/intl/use-translation";
import { hasFormatErrors } from "@repo/api/domains/profile/truth/lint";
import { Button } from "@repo/web/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/web/components/ui/dialog";
import { toast } from "@repo/web/components/ui/sonner";

import { AiAtWork } from "~/domains/workspace/components/ai-at-work";
import { useTRPC } from "~/tools/trpc/client";

import { useLatestValidation } from "../hooks/use-profile-validation";
import { useProfileEditor } from "./profile-editor-context";

/**
 * One button, two steps (profile spec, "Validate and publish"): Validate
 * reviews what changed with AI, charged to the user's credits with the
 * estimate shown first; Publish makes the draft a new version, validated
 * or not. Format findings block publishing; review findings never do.
 */
export function PublishDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslation();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { findings, saveNow, revision, reviewFindings } = useProfileEditor();
  const validation = useLatestValidation();
  const estimate = useQuery({
    ...trpc.profile.validationEstimate.queryOptions({}),
    enabled: open,
    staleTime: 0,
  });
  const validate = useMutation(trpc.profile.validate.mutationOptions());
  const publish = useMutation(trpc.profile.publish.mutationOptions());

  const blocked = hasFormatErrors(findings);
  const running = validation.data?.status === "running";
  const validated =
    validation.data?.status === "completed" &&
    validation.data.draftRevision === revision();
  const nothingToReview = estimate.data?.parts.length === 0;

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: trpc.profile.pathKey() });

  async function startValidation() {
    const saved = await saveNow();
    if (saved === null) {
      toast.error(
        t.formatMessage({
          defaultMessage: "Save the profile before validating.",
        })
      );
      return;
    }
    try {
      await validate.mutateAsync({ baseRevision: saved });
      await refresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t.formatMessage({
              defaultMessage: "The validation couldn't start.",
            })
      );
    }
  }

  async function publishDraft() {
    const saved = await saveNow();
    if (saved === null) {
      toast.error(
        t.formatMessage({
          defaultMessage: "Save the profile before publishing.",
        })
      );
      return;
    }
    try {
      const result = await publish.mutateAsync({ baseRevision: saved });
      toast.success(
        t.formatMessage(
          { defaultMessage: "Version {number, number} published." },
          { number: result.number }
        )
      );
      await refresh();
      onOpenChange(false);
    } catch {
      toast.error(
        t.formatMessage({
          defaultMessage: "The profile couldn't be published.",
        })
      );
    }
  }

  const steps = [
    {
      key: "reading",
      label: t.formatMessage({
        defaultMessage: "Reading what changed since the last version",
      }),
    },
    {
      key: "reviewing",
      label: t.formatMessage({
        defaultMessage:
          "Looking for unclear impact, team work, figures and what you didn't do",
      }),
    },
    {
      key: "checking",
      label: t.formatMessage({
        defaultMessage: "Checking each finding against your words",
      }),
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t.formatMessage({ defaultMessage: "Publish the profile" })}
          </DialogTitle>
          <DialogDescription>
            {t.formatMessage({
              defaultMessage:
                "The published version is what resumes, cover letters and fit checks read. Validate first to have what changed reviewed, or publish as it is.",
            })}
          </DialogDescription>
        </DialogHeader>

        <section className="space-y-3 rounded-lg border p-4">
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <Sparkles className="text-primary size-4" />
            {t.formatMessage({ defaultMessage: "1. Validate (optional)" })}
          </h3>
          {running ? (
            <AiAtWork
              title={t.formatMessage({
                defaultMessage: "Reviewing your profile",
              })}
              steps={steps}
              current={validation.data?.progress?.label ?? "reading"}
              note={t.formatMessage({
                defaultMessage:
                  "You can close this window; the review keeps going.",
              })}
            />
          ) : validated ? (
            <p className="text-muted-foreground text-sm">
              {t.formatMessage(
                {
                  defaultMessage:
                    "Validated. {count, plural, =0 {Nothing to look at.} one {# passage to look at, marked in the text and under Quality review.} other {# passages to look at, marked in the text and under Quality review.}}",
                },
                { count: reviewFindings.length }
              )}
            </p>
          ) : nothingToReview ? (
            <p className="text-muted-foreground text-sm">
              {t.formatMessage({
                defaultMessage: "Nothing changed since the published version.",
              })}
            </p>
          ) : (
            <>
              <p className="text-muted-foreground text-sm">
                {t.formatMessage({
                  defaultMessage:
                    "An AI review of what changed: results without clear impact, your work mixed with the team's, figures that disagree or lack an origin, an empty “what I didn't do”. It also proposes each competency's level. It never rewrites your text.",
                })}
              </p>
              {estimate.data && (
                <p className="text-xs">
                  {t.formatMessage(
                    {
                      defaultMessage:
                        "{parts, plural, =0 {No parts} one {# part} other {# parts}} to review · up to {credits, number} credits",
                    },
                    {
                      parts: estimate.data.parts.length,
                      credits: estimate.data.credits,
                    }
                  )}
                </p>
              )}
              {validation.data?.status === "failed" && (
                <p className="text-destructive text-xs">
                  {t.formatMessage({
                    defaultMessage:
                      "The last validation didn't finish; nothing was charged.",
                  })}
                </p>
              )}
              <Button
                variant="outline"
                size="sm"
                disabled={validate.isPending || !estimate.data}
                onClick={() => void startValidation()}
              >
                {validate.isPending && (
                  <Loader2 className="size-4 animate-spin" />
                )}
                {t.formatMessage({ defaultMessage: "Validate" })}
              </Button>
            </>
          )}
        </section>

        <section className="space-y-2 rounded-lg border p-4">
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <Send className="size-4" />
            {t.formatMessage({ defaultMessage: "2. Publish" })}
          </h3>
          <p className="text-muted-foreground text-sm">
            {blocked
              ? t.formatMessage({
                  defaultMessage:
                    "Fix the format findings first: the rest of StoryToRole reads this format.",
                })
              : t.formatMessage({
                  defaultMessage:
                    "Every version is kept; you can compare and restore them any time.",
                })}
          </p>
        </section>

        <DialogFooter>
          <Button
            disabled={blocked || publish.isPending || running}
            onClick={() => void publishDraft()}
          >
            {publish.isPending && <Loader2 className="size-4 animate-spin" />}
            {validated
              ? t.formatMessage({ defaultMessage: "Publish" })
              : t.formatMessage({
                  defaultMessage: "Publish without validating",
                })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
