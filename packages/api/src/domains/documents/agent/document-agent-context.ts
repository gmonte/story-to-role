import { InstructionsRepository } from "@repo/api/domains/applications/instructions-repository";
import { MotivationRepository } from "@repo/api/domains/applications/motivation/motivation-repository";
import { ResearchRepository } from "@repo/api/domains/applications/research/research-repository";
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

import { readChangeContent } from "../changes/propose-change";
import {
  closingPart,
  factsLines,
  factsPart,
  greetingPart,
  headerLines,
  headerPart,
  type ChangeableContent,
} from "../changes/document-change";
import type { DocumentChangeContent } from "../schemas/document-change";
import { coverageReviewContentSchema } from "../coverage-review/coverage-review";
import {
  reviewNoteKey,
  withoutDismissedFindings,
} from "../coverage-review/finding-key";
import {
  FrozenContexts,
  snapshotCoverage,
  writtenSettings,
} from "../coverage-review/snapshot-coverage";
import { DocumentsRepository } from "../documents-repository";
import { reviewViewOf } from "../generation/review-view";
import type { CareerContext } from "../generation/load-career-context";
import { writtenLines } from "../generation/resume-checks";
import type { OpeningBrief } from "../generation/resume-prompts";
import type { CoverLetterContent } from "../schemas/cover-letter-content";
import type { Line, OutputLanguage } from "../schemas/document";
import type { DocumentContent } from "../schemas/document-content";
import type { GenerationSettings } from "../schemas/generation-settings";
import type { ResumeContent } from "../schemas/resume-content";
import { decryptDocument } from "../snapshot-content";
import {
  loadOpeningUserInput,
  type OpeningUserInput,
} from "./opening-user-input";

/** What the document agent knows for one turn (ADR 0009), never more. */
export type DocumentAgentContext = {
  documentId: string;
  versionId: string;
  kind: "resume" | "cover_letter";
  language: OutputLanguage;
  // The version's latest snapshot: what a change is proposed against.
  snapshotId: string;
  content: ChangeableContent;
  // The version's latest snapshot, line by line, each with its id and
  // where it came from, and each part the agent may change with its key.
  documentText: string;
  // The frozen profile version's lines by id: what a change may cite.
  evidence: Array<{ id: string; text: string }>;
  // The frozen profile version's text: where figures may come from.
  profileText: string | null;
  // The changes waiting for the user in this version, and the last ones
  // they rejected.
  pending: Array<DocumentChangeContent & { id: string }>;
  rejected: DocumentChangeContent[];
  // The lines' ids with their text, for the passage the person selected.
  lines: Array<{ id: string; text: string }>;
  // The profile version the document froze: its index, and its blocks for
  // `read_part`; null when the user has published none.
  profile: {
    versionNumber: number;
    parts: ProfilePart[];
    blocks: ProfileBlock[];
  } | null;
  settings: GenerationSettings;
  purpose:
    | {
        kind: "opening";
        title: string | null;
        company: string | null;
        terms: OpeningBrief["terms"];
        fitCheck: OpeningBrief["fitCheck"];
      }
    | { kind: "focus"; focus: string | null };
  // What the person answered and chose for this opening (gap answers,
  // instructions, a letter's story, motivation and approved facts); null
  // for a library document.
  userInput: OpeningUserInput | null;
  rules: CareerContext["rules"];
  // The language the profile is written in, and its translations
  // dictionary for the document's language (empty in the profile's own).
  profileLanguage: CareerContext["profileLanguage"];
  translations: CareerContext["translations"];
  gaps: string[];
  // The code checks that still count (the ignored warnings are left out).
  findings: Array<{ text: string; lineText: string | null }>;
  // The latest AI coverage review of the version, minus the notes the
  // user ignored; `current` when it reviewed this very snapshot.
  review: {
    current: boolean;
    gaps: string[];
    partial: Array<{ requirement: string; explanation: string }>;
    inconsistencies: Array<{ lineText: string; explanation: string }>;
    suggestions: Array<{ lineText: string | null; text: string }>;
  } | null;
  // What the resume's reviewers said in the version's latest review
  // (rating, contradictions, advice, coverage); null without one.
  reviewers: ReturnType<typeof reviewViewOf>;
};

const shorten = (text: string, max = 160) =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

/**
 * Where a line came from, in a few words: the profile passages it cites
 * (with their position), the application's instructions, a letter's
 * company facts and motivation points, or the person's own typing.
 */
function traceOf(
  line: Line,
  sources: {
    evidence: Map<string, { text: string; position: string | null }>;
    instructions: Map<string, string>;
    facts: Map<string, string>;
    motivation: Map<string, string>;
  }
) {
  const { origin } = line;
  if (origin.kind === "manual") return "written by the person";
  if (origin.kind === "credential") return "a credential, locked";
  const parts: string[] = [];
  if (origin.kind === "edited") parts.push("reworded by the person");
  const evidenceIds =
    origin.kind === "skill" ||
    origin.kind === "evidence" ||
    origin.kind === "instruction" ||
    origin.kind === "letter" ||
    origin.kind === "edited"
      ? origin.evidenceIds
      : [];
  for (const id of evidenceIds) {
    const found = sources.evidence.get(id);
    if (!found) continue;
    parts.push(
      `profile: “${shorten(found.text)}”${found.position ? ` (${found.position})` : ""}`
    );
  }
  const instructionIds =
    origin.kind === "instruction" ||
    origin.kind === "letter" ||
    origin.kind === "edited"
      ? origin.instructionIds
      : [];
  for (const id of instructionIds) {
    const text = sources.instructions.get(id);
    if (text) parts.push(`application instruction: “${shorten(text)}”`);
  }
  if (origin.kind === "letter" || origin.kind === "edited") {
    for (const id of origin.companyFactIds) {
      const text = sources.facts.get(id);
      if (text) parts.push(`company research: “${shorten(text)}”`);
    }
    for (const id of origin.motivationPointIds) {
      const text = sources.motivation.get(id);
      if (text) parts.push(`the person's motivation: “${shorten(text)}”`);
    }
  }
  return parts.length ? parts.join("; ") : "from the profile";
}

export type Sources = Parameters<typeof traceOf>[1];

const tracedLine = (line: Line, sources: Sources) =>
  `[${line.id}] ${line.text}\n    ← ${traceOf(line, sources)}`;

/** The header's lines with their ids, as a part the agent may change. */
const headerText = (content: ResumeContent | CoverLetterContent) => [
  `## header [part: ${headerPart}]`,
  ...headerLines(content.header).map((line) => `[${line.id}] ${line.text}`),
];

export function resumeText(content: ResumeContent, sources: Sources) {
  const out: string[] = headerText(content);
  for (const section of content.sections) {
    const part =
      section.kind === "summary" || section.kind === "skills"
        ? ` [part: ${section.kind}]`
        : "";
    out.push("", `## ${section.kind}${part}`);
    switch (section.kind) {
      case "summary":
        out.push(tracedLine(section.line, sources));
        break;
      case "skills":
        for (const group of section.groups) {
          out.push(
            tracedLine(
              { ...group, text: `${group.label}: ${group.text}` },
              sources
            )
          );
        }
        break;
      case "experience":
        for (const entry of section.entries) {
          out.push(
            `### ${entry.employer} — ${entry.title} (${entry.startDate ?? "?"} – ${entry.endDate ?? "present"})${entry.context ? ` (${entry.context})` : ""} [part: ${factsPart(entry.positionId)}]`,
            ...factsLines(entry).map((line) => `[${line.id}] ${line.text}`),
            `Bullets [part: experience:${entry.positionId}]`
          );
          for (const line of entry.lines) out.push(tracedLine(line, sources));
        }
        break;
      case "projects":
        for (const entry of section.entries) {
          out.push(`### ${entry.name} [part: projects:${entry.projectId}]`);
          for (const line of entry.lines) out.push(tracedLine(line, sources));
        }
        break;
      default:
        for (const entry of section.entries) {
          out.push(
            `- ${[entry.title, entry.institution, entry.level].filter(Boolean).join(", ")} (locked)`
          );
        }
    }
  }
  return out.join("\n");
}

function letterText(content: CoverLetterContent, sources: Sources) {
  return [
    ...headerText(content),
    "",
    `## greeting [part: ${greetingPart}]`,
    `[${greetingPart}] ${content.greeting}`,
    "",
    "## paragraphs [part: letter]",
    ...content.paragraphs.flatMap((line) => ["", tracedLine(line, sources)]),
    "",
    `## closing [part: ${closingPart}]`,
    `[${closingPart}] ${content.closing}`,
  ].join("\n");
}

/**
 * The document as the agent reads it (ADR 0009): the selected version's
 * latest snapshot with each line's trace, the frozen profile version's
 * index, the generation settings, the opening's brief and fit check (or the
 * library focus), the communication rules and the version's current
 * findings. The document must be the user's: the caller checked.
 */
export async function loadDocumentAgentContext(input: {
  db: DbClient;
  cipher: UserCipher;
  userId: string;
  documentId: string;
  // The version the person is on; the document's first when none is given
  // or it isn't this document's.
  versionId?: string | null;
}): Promise<DocumentAgentContext | null> {
  const { db, cipher } = input;
  const repository = new DocumentsRepository(db);
  const profile = await new CareerRepository(db).findProfileByUserId(
    input.userId
  );
  const document = await repository.findDocument(input.documentId);
  if (document?.profileId !== profile?.id) return null;
  const versions = await repository.listVersions([document.id]);
  const version =
    versions.find((row) => row.id === input.versionId) ?? versions[0];
  if (!version) return null;
  const latest = await repository.latestSnapshot(version.id);
  if (!latest) return null;
  const content: DocumentContent = decryptDocument(cipher, latest);
  if (content.kind === "linkedin") return null;

  const contexts = new FrozenContexts(db, cipher, profile.id);
  const openingId = await contexts.openingOf(document.applicationId);
  const written = await repository.latestWrittenGeneration(version.id);
  const coverage = await snapshotCoverage({
    db,
    cipher,
    contexts,
    document,
    version,
    snapshot: latest,
    written,
  });
  const career = coverage.context;
  const settings = await writtenSettings(repository, version, written);
  const focus = document.encryptedFocus
    ? cipher.decrypt(document.encryptedFocus)
    : null;
  const brief = openingId ? await contexts.brief(openingId, career) : null;

  // Where lines come from, by id.
  const positions = new Map(
    career.positions.map((position) => [
      position.id,
      `${position.title}, ${position.employer}`,
    ])
  );
  const sources: Sources = {
    evidence: new Map(
      career.evidence.map((row) => [
        row.id,
        {
          text: row.text,
          position: row.positionId
            ? (positions.get(row.positionId) ?? null)
            : null,
        },
      ])
    ),
    instructions: new Map(
      (openingId
        ? await new InstructionsRepository(db).listPoints(openingId)
        : []
      ).map((point) => [point.id, cipher.decrypt(point.encryptedText)])
    ),
    facts: new Map(
      (openingId && content.kind === "cover_letter"
        ? await new ResearchRepository(db).listFacts(openingId)
        : []
      ).map((fact) => [fact.id, cipher.decrypt(fact.encryptedText)])
    ),
    motivation: new Map(),
  };
  if (openingId && content.kind === "cover_letter") {
    const motivation = new MotivationRepository(db);
    const interview = await motivation.findInterviewByOpening(openingId);
    const points = interview ? await motivation.listPoints(interview.id) : [];
    sources.motivation = new Map(
      points.map((point) => [point.id, cipher.decrypt(point.encryptedText)])
    );
  }

  const lines = writtenLines(content).map(({ id, text }) => ({ id, text }));
  const lineText = new Map(lines.map((line) => [line.id, line.text]));
  const findings = withoutDismissedFindings(
    coverage.findings,
    version.dismissedFindings
  ).map((finding) => ({
    text: `${finding.code}: ${finding.text}`,
    lineText: finding.lineId ? (lineText.get(finding.lineId) ?? null) : null,
  }));

  const stored = await repository.latestCoverageReview(version.id);
  let review: DocumentAgentContext["review"] = null;
  if (stored) {
    const parsed = coverageReviewContentSchema.parse(
      JSON.parse(cipher.decrypt(stored.review.encryptedContent))
    );
    const reviewedText = new Map(
      writtenLines(decryptDocument(cipher, stored.snapshot)).map((line) => [
        line.id,
        line.text,
      ])
    );
    const hidden = new Set(version.dismissedFindings);
    const inconsistencies = parsed.inconsistencies.flatMap((item) => {
      const text = reviewedText.get(item.lineId);
      if (text === undefined) return [];
      const note = {
        kind: "inconsistency",
        lineText: text,
        text: item.explanation,
      };
      return hidden.has(reviewNoteKey(note))
        ? []
        : [{ lineText: text, explanation: item.explanation }];
    });
    const suggestions = parsed.suggestions.flatMap((item) => {
      const text = item.lineId ? (reviewedText.get(item.lineId) ?? null) : null;
      const note = { kind: "suggestion", lineText: text, text: item.text };
      return hidden.has(reviewNoteKey(note))
        ? []
        : [{ lineText: text, text: item.text }];
    });
    review = {
      current: stored.snapshot.id === latest.id,
      gaps: parsed.gaps,
      partial: parsed.partial,
      inconsistencies,
      suggestions,
    };
  }

  const reviewers =
    content.kind === "resume" && written
      ? reviewViewOf(
          await repository.listReviewRounds(written.id),
          cipher,
          openingId ? "opening" : "focus",
          { latestId: latest.id, generationSnapshotId: written.snapshotId }
        )
      : null;

  // How many rejected changes the agent is reminded of.
  const rememberedRejections = 5;
  const pending = (await repository.listPendingChanges(version.id)).map(
    (row) => ({ id: row.id, ...readChangeContent(cipher, row) })
  );
  const rejected = (
    await repository.listRejectedChanges(version.id, rememberedRejections)
  ).map((row) => readChangeContent(cipher, row));

  const published = await loadPublishedProfile({
    db,
    cipher,
    userId: input.userId,
    profileVersionId: latest.profileVersionId ?? undefined,
  });
  const blocks = published ? parseBlocks(published.markdown) : null;

  return {
    documentId: document.id,
    versionId: version.id,
    kind: content.kind,
    language: version.language,
    snapshotId: latest.id,
    content,
    evidence: career.evidence.map((row) => ({ id: row.id, text: row.text })),
    profileText: published?.markdown ?? null,
    pending,
    rejected,
    documentText:
      content.kind === "resume"
        ? resumeText(content, sources)
        : letterText(content, sources),
    lines,
    profile:
      published && blocks
        ? {
            versionNumber: published.number,
            parts: listParts(blocks),
            blocks,
          }
        : null,
    settings,
    purpose: brief
      ? {
          kind: "opening",
          title: brief.title,
          company: brief.company,
          terms: brief.terms,
          fitCheck: brief.fitCheck,
        }
      : { kind: "focus", focus },
    userInput: openingId
      ? await loadOpeningUserInput({
          db,
          cipher,
          profileId: profile.id,
          openingId,
          kind: content.kind,
          career,
          storyLineId: written?.storyLineId ?? null,
        })
      : null,
    rules: career.rules,
    profileLanguage: career.profileLanguage,
    translations: career.translations,
    gaps: career.gaps,
    findings,
    review,
    reviewers,
  };
}
