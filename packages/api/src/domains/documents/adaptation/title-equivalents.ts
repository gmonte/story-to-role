import type { UserCipher } from "@repo/api/domains/encryption/user-cipher";
import type { SensitiveFilter } from "@repo/api/domains/evidence/sensitive/sensitive-filter";
import type { DbClient } from "@repo/api/tools/db-client";

import { DocumentsRepository } from "../documents-repository";
import type { OutputLanguage } from "../schemas/document";
import type { ResumeContent } from "../schemas/resume-content";

export type TitleEquivalent = {
  positionId: string;
  language: OutputLanguage;
  title: string;
  approved: boolean;
};

/**
 * Position titles in other output languages (resume spec, "Adaptations"),
 * with the sensitivity choices applied like any title code prints.
 */
export async function loadTitleEquivalents(input: {
  db: DbClient;
  cipher: UserCipher;
  profileId: string;
  filter: SensitiveFilter;
}): Promise<TitleEquivalent[]> {
  return (
    await new DocumentsRepository(input.db).listTitleEquivalents(
      input.profileId
    )
  ).map((row) => ({
    positionId: row.positionId,
    language: row.language,
    title: input.filter.apply(input.cipher.decrypt(row.encryptedTitle)),
    approved: !!row.approvedAt,
  }));
}

/** Approved titles in one language: a locked fact there, by position. */
export function approvedTitles(
  equivalents: TitleEquivalent[],
  language: OutputLanguage
) {
  return new Map(
    equivalents
      .filter((row) => row.approved && row.language === language)
      .map((row) => [row.positionId, row.title])
  );
}

/** For the locked-fact check: the titles code accepts besides the original. */
export function acceptedTitles(
  equivalents: TitleEquivalent[],
  language: OutputLanguage
) {
  return new Map(
    [...approvedTitles(equivalents, language)].map(([id, title]) => [
      id,
      [title],
    ])
  );
}

/**
 * The title each position gets in an adaptation into `language`: its
 * approved equivalent there; otherwise the original title when the source
 * printed an equivalent of another language; otherwise what the source
 * printed (an override for this application, say).
 */
export function titlesForAdaptation(input: {
  source: ResumeContent;
  language: OutputLanguage;
  equivalents: TitleEquivalent[];
  originals: Map<string, string>;
}) {
  const approved = approvedTitles(input.equivalents, input.language);
  const titles = new Map<string, string>();
  for (const section of input.source.sections) {
    if (section.kind !== "experience") continue;
    for (const entry of section.entries) {
      const translated = input.equivalents.some(
        (row) =>
          row.positionId === entry.positionId &&
          row.approved &&
          row.title === entry.title
      );
      titles.set(
        entry.positionId,
        approved.get(entry.positionId) ??
          (translated
            ? (input.originals.get(entry.positionId) ?? entry.title)
            : entry.title)
      );
    }
  }
  return titles;
}
