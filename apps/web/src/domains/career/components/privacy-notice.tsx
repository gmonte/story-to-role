"use client";

import { useMutation } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";

import type { CareerLanguage } from "@repo/api/domains/career/schemas/career";
import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";

import { useTRPC } from "~/tools/trpc/client";

import { useRefreshCareer } from "../hooks/use-career-queries";
import { InterviewLanguageSelect } from "./interview-language-select";

/**
 * Shown before the first question (guided interview spec): what goes to the
 * AI provider, what to avoid saying, and that sensitive items can be hidden.
 */
export function PrivacyNotice({
  interviewLanguage,
}: {
  interviewLanguage: CareerLanguage;
}) {
  const t = useTranslation();
  const trpc = useTRPC();
  const refresh = useRefreshCareer();
  const accept = useMutation(
    trpc.career.acceptPrivacyNotice.mutationOptions({ onSuccess: refresh })
  );

  const points = [
    t.formatMessage({
      defaultMessage:
        "What you tell the interviewer is sent to our AI provider to understand it. Providers don't train models on this data.",
    }),
    t.formatMessage({
      defaultMessage:
        "Avoid client data under NDA, salaries, other people's personal data, health and family matters.",
    }),
    t.formatMessage({
      defaultMessage:
        "Names, codenames and figures you mention can be generalized or hidden later, before anything is generated.",
    }),
    t.formatMessage({
      defaultMessage:
        "Voice input runs on your device: audio never leaves it. Your conversation is encrypted and deleted 7 days after you approve what was extracted.",
    }),
  ];

  return (
    <div className="mx-auto flex h-full max-w-xl flex-col justify-center gap-6 p-6">
      <div className="flex flex-col gap-2">
        <ShieldCheck className="text-brand-accent size-8" />
        <h2 className="font-display text-2xl font-semibold tracking-tight">
          {t.formatMessage({ defaultMessage: "Before we start" })}
        </h2>
      </div>
      <ul className="text-muted-foreground flex list-disc flex-col gap-2 pl-5 text-sm">
        {points.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">
          {t.formatMessage({ defaultMessage: "Interview language" })}
        </span>
        <InterviewLanguageSelect value={interviewLanguage} />
      </div>
      <Button disabled={accept.isPending} onClick={() => accept.mutate({})}>
        {t.formatMessage({ defaultMessage: "I understand, let's start" })}
      </Button>
    </div>
  );
}
