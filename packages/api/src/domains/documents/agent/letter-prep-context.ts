import { MotivationRepository } from "@repo/api/domains/applications/motivation/motivation-repository";
import { CareerRepository } from "@repo/api/domains/career/career-repository";
import type { UserCipher } from "@repo/api/domains/encryption/user-cipher";
import { loadPublishedProfile } from "@repo/api/domains/profile/load-published-profile";
import {
  parseBlocks,
  type ProfileBlock,
} from "@repo/api/domains/profile/truth/blocks";
import {
  listParts,
  type ProfilePart,
} from "@repo/api/domains/profile/truth/suggestions";
import type { DbClient } from "@repo/api/tools/db-client";

import { FrozenContexts } from "../coverage-review/snapshot-coverage";
import { DocumentsRepository } from "../documents-repository";
import type { CareerContext } from "../generation/load-career-context";
import type { OpeningBrief } from "../generation/resume-prompts";
import type { OutputLanguage } from "../schemas/document";
import { decryptDocument } from "../snapshot-content";
import { resumeText, type Sources } from "./document-agent-context";
import {
  loadOpeningUserInput,
  type OpeningUserInput,
} from "./opening-user-input";

/**
 * What the cover letter's agent knows before the letter exists (ADR 0009):
 * the published profile, the opening, what the person answered and chose
 * (the instructions, the company facts they ticked, the motivation points
 * so far), the motivation interview and the opening's resume, when there
 * is one. There is no document to change yet: it answers in chat.
 */
export type LetterPrepContext = {
  documentId: string;
  language: OutputLanguage;
  profile: {
    versionNumber: number;
    parts: ProfilePart[];
    blocks: ProfileBlock[];
  } | null;
  opening: {
    title: string | null;
    company: string | null;
    terms: OpeningBrief["terms"];
    fitCheck: OpeningBrief["fitCheck"];
  };
  userInput: OpeningUserInput;
  // The motivation interview so far, oldest first.
  interview: Array<{ role: "question" | "answer" | "steer"; text: string }>;
  // The opening's latest resume version, as plain lines; read-only here.
  resume: string | null;
  rules: CareerContext["rules"];
  gaps: string[];
};

const emptySources: Sources = {
  evidence: new Map(),
  instructions: new Map(),
  facts: new Map(),
  motivation: new Map(),
};

/** A resume's lines without ids, part keys and traces. */
const plainResume = (text: string) =>
  text
    .replace(/\n {4}← [^\n]*/g, "")
    .replace(/^\[[^\]\n]*\] /gm, "")
    .replace(/ \[part: [^\]]*\]/g, "");

/**
 * The context of a cover letter document that has no version yet, or null
 * when the document isn't the user's, isn't a letter, or has a version
 * (then the document agent's own context applies).
 */
export async function loadLetterPrepContext(input: {
  db: DbClient;
  cipher: UserCipher;
  userId: string;
  documentId: string;
}): Promise<LetterPrepContext | null> {
  const { db, cipher } = input;
  const repository = new DocumentsRepository(db);
  const profile = await new CareerRepository(db).findProfileByUserId(
    input.userId
  );
  const document = await repository.findDocument(input.documentId);
  if (
    document?.profileId !== profile?.id ||
    document.kind !== "cover_letter" ||
    !document.applicationId
  ) {
    return null;
  }
  if ((await repository.listVersions([document.id])).length > 0) return null;
  const application = await repository.findApplication(document.applicationId);
  if (!application) return null;
  const openingId = application.openingId;

  const contexts = new FrozenContexts(db, cipher, profile.id);
  const career = await contexts.load({ profileVersionId: null, openingId });
  const brief = await contexts.brief(openingId, career);
  const published = await loadPublishedProfile({
    db,
    cipher,
    userId: input.userId,
  });
  const blocks = published ? parseBlocks(published.markdown) : null;
  const userInput = await loadOpeningUserInput({
    db,
    cipher,
    profileId: profile.id,
    openingId,
    kind: "cover_letter",
    career,
    storyLineId: null,
    draftMotivation: true,
  });

  const motivation = new MotivationRepository(db);
  const interview = await motivation.findInterviewByOpening(openingId);
  const turns = interview ? await motivation.listTurns(interview.id) : [];

  const resumeDocument = (
    await repository.listApplicationDocuments(application.id)
  ).find((row) => row.kind === "resume");
  const resumeVersion = resumeDocument
    ? (await repository.listVersions([resumeDocument.id])).at(-1)
    : undefined;
  const resumeSnapshot = resumeVersion
    ? await repository.latestSnapshot(resumeVersion.id)
    : null;
  const resumeContent = resumeSnapshot
    ? decryptDocument(cipher, resumeSnapshot)
    : null;

  return {
    documentId: document.id,
    language: career.profileLanguage ?? "en-US",
    profile:
      published && blocks
        ? {
            versionNumber: published.number,
            parts: listParts(blocks),
            blocks,
          }
        : null,
    opening: {
      title: brief.title,
      company: brief.company,
      terms: brief.terms,
      fitCheck: brief.fitCheck,
    },
    userInput,
    interview: turns.map((turn) => ({
      role: turn.role,
      text: cipher.decrypt(turn.encryptedText),
    })),
    resume:
      resumeContent?.kind === "resume"
        ? plainResume(resumeText(resumeContent, emptySources))
        : null,
    rules: career.rules,
    gaps: career.gaps,
  };
}
