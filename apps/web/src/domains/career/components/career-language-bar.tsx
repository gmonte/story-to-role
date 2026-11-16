"use client";

import { useMutation } from "@tanstack/react-query";
import { Languages } from "lucide-react";

import type {
  InterviewLanguage,
  InterviewLanguageSource,
} from "@repo/api/domains/career/schemas/career";
import { useTranslation } from "@repo/intl/use-translation";
import { Button } from "@repo/web/components/ui/button";

import { useTRPC } from "~/tools/trpc/client";

import { useRefreshCareer } from "../hooks/use-career-queries";
import { InterviewLanguageSelect } from "./interview-language-select";

/**
 * The language the career is kept in. It's asked at the right moment: once
 * the first imported file set it, or once the conversation started without
 * anyone choosing, the bar says what it means and asks to keep or change
 * it. Otherwise it's a quiet selector.
 */
export function CareerLanguageBar({
  interviewLanguage,
  source,
  started,
}: {
  interviewLanguage: InterviewLanguage;
  source: InterviewLanguageSource | null;
  // The conversation has messages.
  started: boolean;
}) {
  const t = useTranslation();
  const trpc = useTRPC();
  const refresh = useRefreshCareer();
  const keep = useMutation(
    trpc.career.updateSettings.mutationOptions({ onSuccess: refresh })
  );
  const names: Record<InterviewLanguage, string> = {
    "en-US": t.formatMessage({ defaultMessage: "English" }),
    "pt-BR": t.formatMessage({ defaultMessage: "Brazilian Portuguese" }),
  };
  const name = names[interviewLanguage];
  const ask = source === "file" || (source === null && started);

  if (!ask) {
    return (
      <div className="flex items-center justify-end gap-2 border-b px-4 py-2">
        <span className="text-muted-foreground text-xs">
          {t.formatMessage({ defaultMessage: "Your career is kept in" })}
        </span>
        <div className="w-44">
          <InterviewLanguageSelect value={interviewLanguage} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3 border-b bg-amber-500/10 px-4 py-2.5 text-sm">
      <Languages className="size-4 shrink-0" />
      <p className="min-w-0 flex-1">
        {t.formatMessage(
          {
            defaultMessage:
              "Your career facts will be kept in {language}: the interview talks in it and your evidence is written in it. Documents can still be in any language.",
          },
          { language: name }
        )}
      </p>
      <div className="flex items-center gap-2">
        <div className="w-40">
          <InterviewLanguageSelect value={interviewLanguage} />
        </div>
        <Button
          size="sm"
          disabled={keep.isPending}
          onClick={() => keep.mutate({ interviewLanguage })}
        >
          {t.formatMessage(
            { defaultMessage: "Keep {language}" },
            { language: name }
          )}
        </Button>
      </div>
    </div>
  );
}
