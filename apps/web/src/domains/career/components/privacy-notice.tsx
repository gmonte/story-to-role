"use client";

import { useMutation } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";

import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";

import { useTRPC } from "~/tools/trpc/client";

import { useRefreshCareer } from "../hooks/use-career-queries";

/**
 * Shown before career data arrives (privacy spec): how it is stored, what
 * goes to the AI provider, what to avoid writing, and how names and figures
 * stay out of documents.
 */
export function PrivacyNotice() {
  const t = useTranslation();
  const trpc = useTRPC();
  const refresh = useRefreshCareer();
  const accept = useMutation(
    trpc.career.acceptPrivacyNotice.mutationOptions({ onSuccess: refresh })
  );

  const points = [
    t.formatMessage({
      defaultMessage:
        "What you write in your profile and the files you upload are stored encrypted with your own key.",
    }),
    t.formatMessage({
      defaultMessage:
        "To propose and review content, the passages needed are sent to our AI provider. Providers don't train models on this data.",
    }),
    t.formatMessage({
      defaultMessage:
        "Your messages to the profile agent and to a document's agent, and their replies, pass through our task platform (Trigger.dev) and stay there for up to 7 days; our own copy is encrypted and deleted after 7 days.",
    }),
    t.formatMessage({
      defaultMessage:
        "Avoid client data under NDA, salaries, other people's personal data, health and family matters.",
    }),
    t.formatMessage({
      defaultMessage:
        "Names and figures can be kept out of your documents with your profile's communication rules.",
    }),
    t.formatMessage({
      defaultMessage:
        "Voice input uses your browser's speech recognition (Google's in Chrome and Edge, Apple's in Safari); StoryToRole never receives the audio.",
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
      <Button disabled={accept.isPending} onClick={() => accept.mutate({})}>
        {t.formatMessage({ defaultMessage: "I understand, let's start" })}
      </Button>
    </div>
  );
}
