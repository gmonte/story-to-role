"use client";

import type { InterviewLanguage } from "@repo/api/domains/career/schemas/career";
import { Badge } from "@repo/web/components/ui/badge";

const shortName: Record<InterviewLanguage, string> = {
  "en-US": "EN",
  "pt-BR": "PT",
};

/**
 * The language an item was told in, shown only when the career holds
 * evidence in both languages (guided interview spec).
 */
export function LanguageBadges({
  languages,
  bilingual,
}: {
  languages: InterviewLanguage[];
  bilingual: boolean;
}) {
  if (!bilingual) return null;
  return languages.map((language) => (
    <Badge key={language} variant="outline" className="px-1.5 text-[10px]">
      {shortName[language]}
    </Badge>
  ));
}
