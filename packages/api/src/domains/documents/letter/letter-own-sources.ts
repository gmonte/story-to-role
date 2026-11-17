import { MotivationRepository } from "@repo/api/domains/applications/motivation/motivation-repository";
import { ResearchRepository } from "@repo/api/domains/applications/research/research-repository";
import type { UserCipher } from "@repo/api/domains/encryption/user-cipher";
import type { DbClient } from "@repo/api/tools/db-client";

import type { CoverLetterContent } from "../schemas/cover-letter-content";

/**
 * The texts of the company facts and the motivation points a letter cites:
 * what the figure check reads besides the frozen profile, since a figure
 * there is the company's (an approved fact) or the user's own words.
 */
export async function loadLetterOwnSources(input: {
  db: DbClient;
  cipher: UserCipher;
  openingId: string | null;
  content: CoverLetterContent;
}): Promise<string[]> {
  if (!input.openingId) return [];
  const cited = (key: "companyFactIds" | "motivationPointIds") =>
    new Set(
      input.content.paragraphs.flatMap((line) =>
        line.origin.kind === "letter" ? line.origin[key] : []
      )
    );
  const facts = cited("companyFactIds");
  const points = cited("motivationPointIds");
  const texts: string[] = [];
  if (facts.size > 0) {
    for (const fact of await new ResearchRepository(input.db).listFacts(
      input.openingId
    )) {
      if (facts.has(fact.id))
        texts.push(input.cipher.decrypt(fact.encryptedText));
    }
  }
  if (points.size > 0) {
    const motivation = new MotivationRepository(input.db);
    const interview = await motivation.findInterviewByOpening(input.openingId);
    for (const point of interview
      ? await motivation.listPoints(interview.id)
      : []) {
      if (points.has(point.id)) {
        texts.push(input.cipher.decrypt(point.encryptedText));
      }
    }
  }
  return texts;
}
