"use client";

import { useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  type ApplicationSource,
  type ApplicationType,
  applicationSourceSchema,
  applicationTypeSchema,
} from "@repo/api/domains/applications/schemas/application";
import type { ApplicationDetail } from "@repo/api/domains/applications/schemas/tracker";
import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";
import { Input } from "@repo/web/components/ui/input";
import { Label } from "@repo/web/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/web/components/ui/select";
import { toast } from "@repo/web/components/ui/sonner";
import { Textarea } from "@repo/web/components/ui/textarea";

import { useTRPC } from "~/tools/trpc/client";

import { useRefreshTracker } from "../hooks/use-tracker";
import { useTrackerLabels } from "../hooks/use-tracker-labels";
import { today } from "../utils/dates";

const unset = "unset";

/**
 * The method's fields of an application (tracker spec): source,
 * application type, the resume sent, next step and notes. Notes and next
 * steps are encrypted and never reach a prompt.
 */
export function ApplicationDetails({ detail }: { detail: ApplicationDetail }) {
  const t = useTranslation();
  const labels = useTrackerLabels();
  const trpc = useTRPC();
  const refresh = useRefreshTracker();
  const [source, setSource] = useState<ApplicationSource | null>(detail.source);
  const [sourceDetail, setSourceDetail] = useState(detail.sourceDetail ?? "");
  const [type, setType] = useState<ApplicationType | null>(
    detail.applicationType
  );
  const [resumeVersionId, setResumeVersionId] = useState<string | null>(
    detail.resumeSent?.versionId ?? null
  );
  const [nextStep, setNextStep] = useState(detail.nextStep ?? "");
  const [notes, setNotes] = useState(detail.notes ?? "");
  const onError = (error: { message: string }) => toast.error(error.message);

  const options = useQuery({
    ...trpc.tracker.resumeVersions.queryOptions({}),
    enabled: detail.external,
  });
  const save = useMutation(
    trpc.tracker.updateDetails.mutationOptions({
      onSuccess: async () => {
        await refresh();
        toast.success(t.formatMessage({ defaultMessage: "Saved" }));
      },
      onError,
    })
  );
  const sentResume = detail.submissions.find(
    (submission) => submission.documentKind === "resume"
  );
  const text = (value: string) => value.trim() || null;

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate({
          applicationId: detail.id,
          source,
          sourceDetail: text(sourceDetail),
          applicationType: type,
          ...(detail.external && !sentResume ? { resumeVersionId } : {}),
          nextStep: text(nextStep),
          notes: text(notes),
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label>{t.formatMessage({ defaultMessage: "Source" })}</Label>
          <Select
            value={source ?? unset}
            onValueChange={(value) =>
              setSource(value === unset ? null : (value as ApplicationSource))
            }
          >
            <SelectTrigger size="sm" className="w-full">
              <SelectValue>{labels.source(source)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={unset}>{labels.source(null)}</SelectItem>
              {applicationSourceSchema.options.map((option) => (
                <SelectItem key={option} value={option}>
                  {labels.sources[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {source === "other" && (
            <Input
              value={sourceDetail}
              maxLength={200}
              aria-label={t.formatMessage({ defaultMessage: "Source details" })}
              placeholder={t.formatMessage({
                defaultMessage: "Where did you find it?",
              })}
              onChange={(event) => setSourceDetail(event.target.value)}
            />
          )}
        </div>
        <div className="grid gap-1.5">
          <Label>
            {t.formatMessage({ defaultMessage: "Application type" })}
          </Label>
          <Select
            value={type ?? unset}
            onValueChange={(value) =>
              setType(value === unset ? null : (value as ApplicationType))
            }
          >
            <SelectTrigger size="sm" className="w-full">
              <SelectValue>
                {type
                  ? labels.types[type]
                  : t.formatMessage({ defaultMessage: "Not recorded" })}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={unset}>
                {t.formatMessage({ defaultMessage: "Not recorded" })}
              </SelectItem>
              {applicationTypeSchema.options.map((option) => (
                <SelectItem key={option} value={option}>
                  {labels.types[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label>{t.formatMessage({ defaultMessage: "Resume sent" })}</Label>
        {sentResume ? (
          <p className="text-muted-foreground text-xs">
            {t.formatMessage(
              {
                defaultMessage:
                  "{version}, recorded when you sent it from StoryToRole.",
              },
              {
                version:
                  detail.resumeSent?.label ??
                  t.formatMessage({ defaultMessage: "Resume" }),
              }
            )}
          </p>
        ) : detail.external ? (
          <Select
            value={resumeVersionId ?? unset}
            onValueChange={(value) =>
              setResumeVersionId(value === unset ? null : value)
            }
          >
            <SelectTrigger size="sm" className="w-full">
              <SelectValue>
                {options.data?.find(
                  (option) => option.versionId === resumeVersionId
                )?.label ?? t.formatMessage({ defaultMessage: "Not recorded" })}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={unset}>
                {t.formatMessage({ defaultMessage: "Not recorded" })}
              </SelectItem>
              {(options.data ?? []).map((option) => (
                <SelectItem key={option.versionId} value={option.versionId}>
                  {t.formatMessage(
                    { defaultMessage: "{label} ({language})" },
                    {
                      label:
                        option.label ??
                        t.formatMessage({ defaultMessage: "Resume" }),
                      language: option.language,
                    }
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <p className="text-muted-foreground text-xs">
            {t.formatMessage({
              defaultMessage:
                "Recorded when you mark the application as applied.",
            })}
          </p>
        )}
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="next-step">
          {t.formatMessage({ defaultMessage: "Next step" })}
        </Label>
        <Input
          id="next-step"
          value={nextStep}
          maxLength={2000}
          placeholder={t.formatMessage({
            defaultMessage: "HR interview on Sep 20",
          })}
          onChange={(event) => setNextStep(event.target.value)}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="notes">
          {t.formatMessage({ defaultMessage: "Notes" })}
        </Label>
        <Textarea
          id="notes"
          value={notes}
          maxLength={10_000}
          onChange={(event) => setNotes(event.target.value)}
        />
        <p className="text-muted-foreground text-xs">
          {t.formatMessage({
            defaultMessage:
              "Notes and next steps are encrypted and never sent to the AI.",
          })}
        </p>
      </div>
      <Button
        type="submit"
        size="sm"
        className="self-start"
        disabled={save.isPending}
      >
        {t.formatMessage({ defaultMessage: "Save" })}
      </Button>
    </form>
  );
}

/**
 * Giving up (tracker spec): the user's own reason, kept for the
 * retrospective, and the two buttons that feed the job preferences from
 * it. Apart from the rest of the form: they change what is recommended.
 */
export function ApplicationWithdraw({ detail }: { detail: ApplicationDetail }) {
  const t = useTranslation();
  const trpc = useTRPC();
  const refresh = useRefreshTracker();
  const queryClient = useQueryClient();
  const [declineReason, setDeclineReason] = useState(
    detail.declineReason ?? ""
  );
  const onError = (error: { message: string }) => toast.error(error.message);
  const save = useMutation(
    trpc.tracker.updateDetails.mutationOptions({
      onSuccess: async () => {
        await refresh();
        toast.success(t.formatMessage({ defaultMessage: "Saved" }));
      },
      onError,
    })
  );
  const preferencesChanged = () => {
    void queryClient.invalidateQueries({ queryKey: trpc.profile.pathKey() });
    void queryClient.invalidateQueries({ queryKey: trpc.openings.pathKey() });
  };
  const addRule = useMutation(
    trpc.tracker.addDeclineReasonAsRule.mutationOptions({
      onSuccess: () => {
        preferencesChanged();
        toast.success(
          t.formatMessage({
            defaultMessage:
              "Added to your discard rules; the next fit checks count it.",
          })
        );
      },
      onError,
    })
  );
  const exclude = useMutation(
    trpc.tracker.excludeCompany.mutationOptions({
      onSuccess: ({ company }) => {
        preferencesChanged();
        toast.success(
          t.formatMessage(
            {
              defaultMessage:
                "{company} is now among your excluded companies; the next fit checks count it.",
            },
            { company }
          )
        );
      },
      onError,
    })
  );

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate({
          applicationId: detail.id,
          declineReason: declineReason.trim() || null,
        });
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="decline-reason">
          {t.formatMessage({ defaultMessage: "Why you gave up (your reason)" })}
        </Label>
        <Textarea
          id="decline-reason"
          value={declineReason}
          maxLength={2000}
          onChange={(event) => setDeclineReason(event.target.value)}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          size="sm"
          variant="outline"
          disabled={save.isPending}
        >
          {t.formatMessage({ defaultMessage: "Save the reason" })}
        </Button>
        {/* Saved reason only: the rule is what the server stored. */}
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={addRule.isPending || !detail.declineReason}
          onClick={() => addRule.mutate({ applicationId: detail.id })}
        >
          {t.formatMessage({ defaultMessage: "Add as a discard rule" })}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="destructive"
          disabled={exclude.isPending}
          onClick={() =>
            exclude.mutate({ applicationId: detail.id, date: today() })
          }
        >
          {t.formatMessage({ defaultMessage: "Exclude the company" })}
        </Button>
      </div>
    </form>
  );
}
