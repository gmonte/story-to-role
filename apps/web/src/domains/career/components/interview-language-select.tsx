"use client";

import { useMutation } from "@tanstack/react-query";

import {
  careerLanguages,
  type CareerLanguage,
} from "@repo/api/domains/career/schemas/career";
import { intlConfig } from "@repo/intl/intl-config";
import { useTranslation } from "@repo/intl/use-translation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/web/components/ui/select";

import { useTRPC } from "~/tools/trpc/client";

import { useRefreshCareer } from "../hooks/use-career-queries";

/**
 * The interview language, set independently of the interface language;
 * a change takes effect from the next turn.
 */
export function InterviewLanguageSelect({ value }: { value: CareerLanguage }) {
  const t = useTranslation();
  const trpc = useTRPC();
  const refresh = useRefreshCareer();
  const update = useMutation(
    trpc.career.updateSettings.mutationOptions({ onSuccess: refresh })
  );

  return (
    <Select
      value={value}
      disabled={update.isPending}
      onValueChange={(language) =>
        update.mutate({ interviewLanguage: language as CareerLanguage })
      }
    >
      <SelectTrigger
        className="w-full"
        aria-label={t.formatMessage({ defaultMessage: "Interview language" })}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {careerLanguages.map((language) => (
          <SelectItem key={language} value={language}>
            {intlConfig.locales[language].translatedName}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
