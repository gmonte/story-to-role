"use client";

import { useEffect, useState } from "react";

import { useRealtimeRun } from "@trigger.dev/react-hooks";

import {
  taskProgressSchema,
  type RealtimeSubscription,
} from "@repo/api/domains/tasks/schemas/task";
import { useTranslation } from "@repo/intl/use-translation";

import { AiAtWork } from "~/domains/workspace/components/ai-at-work";

/**
 * One file's import, live: each step as the task reports it and what it
 * found, with the reassurance that the page can be left.
 */
export function ImportProgress({
  runId,
  accessToken,
  fileName,
  onDone,
}: RealtimeSubscription & { fileName?: string; onDone: () => void }) {
  const t = useTranslation();
  const [finished, setFinished] = useState(false);
  const { run } = useRealtimeRun(runId, {
    accessToken,
    onComplete: () => setFinished(true),
  });
  // What it found stays on screen a moment before the card goes.
  useEffect(() => {
    if (!finished) return;
    const timer = setTimeout(onDone, 4000);
    return () => clearTimeout(timer);
  }, [finished, onDone]);
  const parsed = taskProgressSchema.safeParse(run?.metadata?.progress);
  // The saving step repeats what the found step counted.
  const found = parsed.success ? parsed.data.counts : undefined;
  const current = parsed.success ? parsed.data.label : undefined;

  return (
    <AiAtWork
      title={
        fileName
          ? t.formatMessage(
              { defaultMessage: "Reading {file}" },
              { file: fileName }
            )
          : t.formatMessage({ defaultMessage: "Reading your file" })
      }
      current={finished ? "done" : (current ?? "reading")}
      steps={[
        {
          key: "reading",
          label: t.formatMessage({ defaultMessage: "Reading the text" }),
        },
        {
          key: "checking",
          label: t.formatMessage({
            defaultMessage: "Checking it's about your career",
          }),
        },
        {
          key: "extracting",
          label: t.formatMessage({
            defaultMessage: "Finding positions, facts and credentials",
          }),
        },
        {
          key: "found",
          label: t.formatMessage({ defaultMessage: "Lining up what it found" }),
        },
        {
          key: "saving",
          label: t.formatMessage({
            defaultMessage: "Adding it to your timeline for review",
          }),
        },
      ]}
      detail={
        found?.positions !== undefined &&
        t.formatMessage(
          {
            defaultMessage:
              "Found {positions, plural, =0 {no positions} one {# position} other {# positions}}, {facts, plural, =0 {no facts} one {# fact} other {# facts}} and {credentials, plural, =0 {no credentials} one {# credential} other {# credentials}}.",
          },
          {
            positions: found.positions,
            facts: found.facts ?? 0,
            credentials: found.credentials ?? 0,
          }
        )
      }
      note={t.formatMessage({
        defaultMessage:
          "You can leave this page: the import carries on, and what it finds waits for you here.",
      })}
    />
  );
}
