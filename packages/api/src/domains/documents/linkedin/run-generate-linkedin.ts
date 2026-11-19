import { randomUUID } from "node:crypto";

import { KeyUnusableError } from "@repo/api/domains/ai/providers/provider-package";
import type { AiClient } from "@repo/api/domains/ai/ai-client";
import { CareerRepository } from "@repo/api/domains/career/career-repository";
import type { UserCipher } from "@repo/api/domains/encryption/user-cipher";
import { loadNeverIncludeFilter } from "@repo/api/domains/profile/rules/load-never-include-filter";
import type { TaskProgress } from "@repo/api/domains/tasks/schemas/task";
import type { DbClient } from "@repo/api/tools/db-client";
import { logger } from "@repo/common/tools/logger";

import type { CoverageReviewContent } from "../coverage-review/coverage-review";
import { reviewCoverage } from "../coverage-review/run-coverage-review";
import { DocumentsRepository } from "../documents-repository";
import { repairPublicNames } from "../generation/public-names";
import {
  assembleResume,
  type AssemblyDraft,
  type DroppedLine,
} from "../generation/assemble-resume";
import { loadCareerContext } from "../generation/load-career-context";
import { purposesOf, resumeMaterial } from "../generation/resume-prompts";
import { reviewLoopSettings } from "../generation/review-loop-settings";
import {
  findForbiddenLines,
  lockedFactViolations,
} from "../generation/resume-checks";
import {
  defaultGenerationSettings,
  generationSettingsSchema,
} from "../schemas/generation-settings";
import type { Line } from "../schemas/document";
import {
  headlineMaxLength,
  type LinkedinContent,
} from "../schemas/linkedin-content";
import { decryptDocument } from "../snapshot-content";
import { loadWritingSetup } from "../writing/load-writing-setup";
import { proficiencyOf } from "./linkedin-proficiency";
import { linkedinAsResume } from "./linkedin-resume";
import {
  careerFocus,
  type LinkedinDraft,
  linkedinDraftSchema,
  linkedinPrompt,
  linkedinPurposeLines,
  linkedinSectionInstruction,
  linkedinSettings,
} from "./linkedin-prompts";

/** A line code refused, or a headline option longer than LinkedIn takes. */
export type LinkedinDroppedLine =
  | DroppedLine
  | { text: string; reason: "too_long" };

/**
 * Assembles LinkedIn content from a draft by the resume's own rules
 * (`assembleResume`): locked facts printed by code, each line citing
 * profile lines, figures only where the profile marks them measured, the
 * communication rules, studied and never-claim terms refused, at most
 * four bullets per experience and project, and the very old rule. LinkedIn has no requirement
 * to justify a very old experience, so under “relevant only” it is left
 * out. Positions and projects with no line left are not printed. Each
 * headline option and education description is checked like the summary;
 * the first headline option kept is the chosen one. The credentials are
 * printed by code, the languages on LinkedIn's scale.
 */
export function assembleLinkedin(input: {
  draft: LinkedinDraft;
  context: Parameters<typeof assembleResume>[0]["context"];
  settings: Parameters<typeof assembleResume>[0]["settings"];
  today: string;
  newLineId?: () => string;
}) {
  const { draft } = input;
  const about = draft.about.paragraphs
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .join("\n\n");
  const assemblyDraft: AssemblyDraft = {
    emphasis: [],
    title_line: "",
    summary: about
      ? { text: about, evidence_ids: draft.about.evidence_ids }
      : null,
    skills: [],
    experience: draft.experience.map((entry) => ({
      position_id: entry.position_id,
      context: null,
      relevance: null,
      bullets: entry.bullets,
    })),
    projects: draft.projects.map((entry) => ({
      project_id: entry.project_id,
      bullets: entry.bullets,
    })),
  };
  const newLineId = input.newLineId ?? (() => randomUUID().slice(0, 8));
  const settings = linkedinSettings(input.settings);
  const { content, dropped } = assembleResume({
    draft: assemblyDraft,
    context: input.context,
    sections: ["summary", "experience", "projects"],
    settings,
    today: input.today,
    purposes: [],
    targetTitle: null,
    newLineId,
  });
  const summary = content.sections.find(
    (section) => section.kind === "summary"
  );
  const experience = content.sections.find(
    (section) => section.kind === "experience"
  );
  const projects = content.sections.find(
    (section) => section.kind === "projects"
  );
  const allDropped: LinkedinDroppedLine[] = [...dropped];
  // A free line (a headline option, an education's description) passes
  // the summary's checks: it may cite any profile line.
  const grounded = (line: { text: string; evidence_ids: string[] }) => {
    const checked = assembleResume({
      draft: { ...assemblyDraft, summary: line },
      context: input.context,
      sections: ["summary"],
      settings,
      today: input.today,
      purposes: [],
      targetTitle: null,
      newLineId,
    });
    allDropped.push(...checked.dropped);
    const section = checked.content.sections[0];
    return section?.kind === "summary" ? section.line : null;
  };
  const headlineOptions = draft.headlines.flatMap((option): Line[] => {
    if (option.text.trim().length > headlineMaxLength) {
      allDropped.push({ text: option.text, reason: "too_long" });
      return [];
    }
    const line = grounded(option);
    return line ? [line] : [];
  });
  const credentials = (kind: "education" | "certification" | "language") =>
    input.context.credentials
      .filter((row) => row.kind === kind)
      .map((row) => ({
        credentialId: row.id,
        title: row.title,
        institution: row.institution,
        level: row.level,
        startDate: row.startDate,
        endDate: row.endDate,
        inProgress: row.inProgress,
      }));
  const linkedin: LinkedinContent = {
    kind: "linkedin",
    headline: headlineOptions[0] ?? null,
    headlineOptions,
    about:
      summary?.kind === "summary"
        ? summary.line
        : { id: newLineId(), text: "", origin: { kind: "manual" } },
    experiences:
      experience?.kind === "experience"
        ? experience.entries
            .filter((entry) => entry.lines.length > 0)
            .map((entry) => ({
              positionId: entry.positionId,
              employer: entry.employer,
              title: entry.title,
              startDate: entry.startDate,
              endDate: entry.endDate,
              lines: entry.lines,
            }))
        : [],
    projects:
      projects?.kind === "projects"
        ? projects.entries
            .filter((entry) => entry.lines.length > 0)
            .map((entry) => ({
              projectId: entry.projectId,
              name: entry.name,
              startDate: entry.startDate,
              endDate: entry.endDate,
              role: entry.role,
              link: entry.link,
              lines: entry.lines,
            }))
        : [],
    education: credentials("education").map((entry) => {
      const drafted = draft.education.find(
        (row) => row.credential_id === entry.credentialId
      )?.description;
      return { ...entry, description: drafted ? grounded(drafted) : null };
    }),
    certifications: credentials("certification"),
    languages: credentials("language").map((entry) => ({
      ...entry,
      proficiency: proficiencyOf(entry.level),
    })),
  };
  return { content: linkedin, dropped: allDropped };
}

const withoutLines = (
  content: LinkedinContent,
  lineIds: string[]
): LinkedinContent => ({
  ...content,
  headline:
    content.headline && lineIds.includes(content.headline.id)
      ? null
      : content.headline,
  headlineOptions: content.headlineOptions.filter(
    (line) => !lineIds.includes(line.id)
  ),
  education: content.education.map((entry) => ({
    ...entry,
    description:
      entry.description && lineIds.includes(entry.description.id)
        ? null
        : entry.description,
  })),
  about: lineIds.includes(content.about.id)
    ? { ...content.about, text: "" }
    : content.about,
  experiences: content.experiences.map((entry) => ({
    ...entry,
    lines: entry.lines.filter((line) => !lineIds.includes(line.id)),
  })),
  projects: content.projects.map((entry) => ({
    ...entry,
    lines: entry.lines.filter((line) => !lineIds.includes(line.id)),
  })),
});

/** Which kind of section a redone section's id names in a text. */
function sectionKind(content: LinkedinContent, section: string) {
  if (section === "headline" || section === "about") return section;
  if (content.experiences.some((row) => row.positionId === section))
    return "position";
  if (content.projects.some((row) => row.projectId === section))
    return "project";
  if (content.education.some((row) => row.credentialId === section))
    return "education";
  return null;
}

/**
 * The text with one section taken from freshly written content, the rest
 * as it was (the user's edits included). A section that came back empty
 * keeps what it had.
 */
export function replaceSection(
  previous: LinkedinContent,
  written: LinkedinContent,
  section: string
): LinkedinContent {
  if (section === "headline") {
    return written.headlineOptions.length
      ? {
          ...previous,
          headline: written.headline,
          headlineOptions: written.headlineOptions,
        }
      : previous;
  }
  if (section === "about") {
    return written.about.text
      ? { ...previous, about: written.about }
      : previous;
  }
  const lines = (entries: Array<{ id: string; lines: Line[] }>) =>
    entries.find((row) => row.id === section)?.lines ?? [];
  const position = lines(
    written.experiences.map((row) => ({ id: row.positionId, lines: row.lines }))
  );
  const project = lines(
    written.projects.map((row) => ({ id: row.projectId, lines: row.lines }))
  );
  const description = written.education.find(
    (row) => row.credentialId === section
  )?.description;
  return {
    ...previous,
    experiences: previous.experiences.map((row) =>
      row.positionId === section && position.length
        ? { ...row, lines: position }
        : row
    ),
    projects: previous.projects.map((row) =>
      row.projectId === section && project.length
        ? { ...row, lines: project }
        : row
    ),
    education: previous.education.map((row) =>
      row.credentialId === section && description
        ? { ...row, description }
        : row
    ),
  };
}

/**
 * Generates the user's LinkedIn text from the profile version the
 * generation froze (resume spec, "LinkedIn"): one writer call, code
 * assembling its draft by the resume's rules, then the coverage review
 * once, against the career as the profile states it. Stored as a snapshot
 * like any document's, with the review. A `linkedin_section` generation
 * writes one section again: the writer asked for it alone, the code
 * checks as always, no coverage review, and a snapshot of the version's
 * latest content with only that section replaced.
 */
export async function runGenerateLinkedin(deps: {
  db: DbClient;
  ai: AiClient;
  cipher: UserCipher;
  userId: string;
  generationId: string;
  reportProgress?: (progress: TaskProgress) => Promise<void>;
  today?: string;
}) {
  const { db, ai, cipher } = deps;
  const documents = new DocumentsRepository(db);
  const generation = await documents.findGeneration(deps.generationId);
  if (!generation) throw new Error(`Generation ${deps.generationId} not found`);
  const profile = await new CareerRepository(db).findProfileById(
    generation.profileId
  );
  if (profile?.userId !== deps.userId) {
    throw new Error(`Generation ${generation.id} belongs to another user`);
  }
  const document = await documents.findDocument(generation.documentId);
  if (document?.kind !== "linkedin") {
    throw new Error(`Generation ${generation.id} is not for a LinkedIn text`);
  }
  // A section written again starts from the version's latest content.
  const redo =
    generation.kind === "linkedin_section" && generation.versionId
      ? await documents.latestSnapshot(generation.versionId)
      : null;
  const previous = redo ? decryptDocument(cipher, redo) : null;
  const section = generation.section ?? "";
  const kind =
    previous?.kind === "linkedin" ? sectionKind(previous, section) : null;
  if (generation.kind === "linkedin_section" && !kind) {
    await documents.updateGeneration(generation.id, {
      status: "failed",
      finishedAt: new Date(),
    });
    throw new Error(`Generation ${generation.id} names no section of its text`);
  }
  await documents.updateGeneration(generation.id, { status: "running" });
  let stoppedBy: KeyUnusableError | null = null;
  try {
    const settings = generationSettingsSchema
      .catch(defaultGenerationSettings)
      .parse(generation.settings ?? defaultGenerationSettings);
    const today = deps.today ?? new Date().toISOString().slice(0, 7);
    const filter = await loadNeverIncludeFilter({
      db,
      cipher,
      profileId: generation.profileId,
      profileVersionId: generation.profileVersionId,
    });
    const context = await loadCareerContext({
      db,
      cipher,
      profileId: generation.profileId,
      filter,
      profileVersionId: generation.profileVersionId,
      language: generation.language,
    });
    if (!context.profileVersionId) {
      throw new Error(`Generation ${generation.id} has no published profile`);
    }
    const brief = {
      title: careerFocus,
      company: null,
      terms: [],
      fitCheck: [],
      focus: careerFocus,
    };
    const setup = await loadWritingSetup({ db, cipher, userId: deps.userId });
    const material = resumeMaterial({
      context,
      opening: brief,
      sections: [],
      language: generation.language,
      tone: generation.tone,
      style: setup.style,
      settings,
      today,
      purposeLines: linkedinPurposeLines,
    });
    const role = generation.writingLevel === "maximum" ? "maximum" : "writing";
    const progress = (step: number, label: string) =>
      deps.reportProgress?.({ step, totalSteps: kind ? 2 : 3, label });

    await progress(1, "drafting");
    const written = await ai.generateObject({
      purpose: "linkedin_writer",
      role,
      maxTokens: reviewLoopSettings.draftMaxTokens,
      schema: linkedinDraftSchema,
      system: [
        linkedinPrompt(
          material,
          settings,
          context.credentials.filter((row) => row.kind === "education")
        ),
        ...(kind ? ["", linkedinSectionInstruction(section, kind)] : []),
      ].join("\n"),
      messages: [
        {
          role: "user",
          content: kind
            ? "Write that section of the LinkedIn text again."
            : "Write the LinkedIn text.",
        },
      ],
    });
    if (!written.object) throw new Error("The writer returned no draft");
    const assembled = assembleLinkedin({
      draft: written.object,
      context,
      settings,
      today,
    });
    // Code has the last word: lines with a forbidden term go.
    const forbidden = findForbiddenLines(
      linkedinAsResume(assembled.content),
      filter
    );
    // A line still naming something by its real name is rewritten once with
    // the public form; if it still does, the code checks warn.
    const repaired = await repairPublicNames({
      ai,
      filter,
      content: assembled.content,
      role,
      language: generation.language,
    });
    stoppedBy ??= repaired.stoppedBy;
    const fresh = withoutLines(repaired.content, forbidden);
    const content =
      previous?.kind === "linkedin"
        ? replaceSection(previous, fresh, section)
        : fresh;
    if (
      lockedFactViolations(linkedinAsResume(content), context.positions)
        .length > 0
    ) {
      throw new Error(`Generation ${generation.id} altered a locked fact`);
    }

    // The coverage review never costs the document: without one it is
    // saved, and the code checks still run on it.
    let coverage: CoverageReviewContent | null = null;
    // A section written again keeps the version's review until the user
    // asks for Review again.
    if (!kind) {
      await progress(2, "coverage_review");
      try {
        coverage = await reviewCoverage({
          ai,
          content: linkedinAsResume(content),
          context,
          brief,
          purposes: purposesOf(brief),
          language: generation.language,
          documentName: "LinkedIn text",
        });
      } catch (error) {
        if (error instanceof KeyUnusableError) {
          stoppedBy = error;
        } else {
          logger.warn(["documents"], "Coverage review failed", {
            generationId: generation.id,
            error: error instanceof Error ? error.name : "unknown",
          });
        }
      }
    }

    await progress(kind ? 2 : 3, "saving");
    await db.transaction(async (tx) => {
      const repository = new DocumentsRepository(tx);
      const existing = generation.versionId
        ? await repository.findVersion(generation.versionId)
        : null;
      const version =
        existing ??
        (await repository.insertVersion({
          documentId: document.id,
          language: generation.language,
        }));
      await repository.lockVersion(version.id);
      const latest = await repository.latestSnapshot(version.id);
      // A section written again goes over the latest content, so an edit
      // saved while it was written stays.
      const current = kind && latest ? decryptDocument(cipher, latest) : null;
      const saved =
        current?.kind === "linkedin"
          ? replaceSection(current, fresh, section)
          : content;
      const snapshot = await repository.insertSnapshot({
        versionId: version.id,
        sequence: (latest?.sequence ?? 0) + 1,
        parentSnapshotId: latest?.id ?? null,
        origin: "generated",
        author: "ai",
        encryptedContent: cipher.encrypt(JSON.stringify(saved)),
        generationId: generation.id,
        profileVersionId: context.profileVersionId,
      });
      if (coverage) {
        await repository.insertCoverageReview({
          generationId: generation.id,
          snapshotId: snapshot.id,
          profileVersionId: context.profileVersionId,
          encryptedContent: cipher.encrypt(JSON.stringify(coverage)),
        });
      }
      await repository.updateGeneration(generation.id, {
        status: "completed",
        versionId: version.id,
        snapshotId: snapshot.id,
        finishedAt: new Date(),
      });
    });
  } catch (error) {
    await documents.updateGeneration(generation.id, {
      status: "failed",
      finishedAt: new Date(),
    });
    throw error;
  }
  if (stoppedBy) throw stoppedBy;
}
