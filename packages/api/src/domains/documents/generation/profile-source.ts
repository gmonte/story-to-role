import { createHash } from "node:crypto";

import type { CredentialKind } from "@repo/api/domains/career/schemas/career";
import type { EvidenceKind } from "@repo/api/domains/evidence/schemas/evidence";
import type { PublishedProfile } from "@repo/api/domains/profile/load-published-profile";
import { parseBlocks } from "@repo/api/domains/profile/truth/blocks";
import { mentions } from "@repo/api/domains/profile/truth/lint";
import { findMarks } from "@repo/api/domains/profile/truth/marks";
import {
  experienceFieldOf,
  normalizeLabel,
  type ExperienceField,
} from "@repo/api/domains/profile/truth/sections";
import {
  readStructure,
  splitLabel,
} from "@repo/api/domains/profile/truth/structure";

import type { ResumeHeaderFields } from "../schemas/template";

/**
 * An id that is the same every time it is derived from the same parts,
 * shaped like the UUIDs the document content holds: a position keeps its id
 * across the profile's versions for as long as its employer, title and
 * start stay the same.
 */
export function stableId(...parts: string[]) {
  const hex = createHash("sha256").update(parts.join("\u0000")).digest("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `5${hex.slice(13, 16)}`,
    `8${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join("-");
}

/**
 * A position's id: the same in every profile version for as long as its
 * employer, title and start stay the same.
 */
export function positionIdOf(
  careerProfileId: string,
  title: { company: string; title: string; range: { start: string } }
) {
  return stableId(
    careerProfileId,
    "position",
    normalizeLabel(title.company),
    normalizeLabel(title.title),
    title.range.start
  );
}

export type SourcePosition = {
  id: string;
  employer: string;
  title: string;
  startDate: string | null;
  // Null for the current position.
  endDate: string | null;
  // What the profile says the person did not do there: never claimed.
  notDone: string[];
};

export type SourceEvidence = {
  id: string;
  positionId: string | null;
  kind: EvidenceKind;
  // As a writer may read it: marks removed, figures it may not use withheld.
  text: string;
  // The text whose numbers a line resting on this may carry (resume spec,
  // "Generation rules": figures only when the profile marks them measured).
  figures: string;
};

export type SourceCredential = {
  id: string;
  kind: CredentialKind;
  title: string;
  institution: string | null;
  level: string | null;
  startDate: string | null;
  endDate: string | null;
  inProgress: boolean;
};

/**
 * What generation may read of a published profile version (ADR 0008): the
 * locked facts, the evidence line by line, the credentials, the competencies
 * the person really uses, the header's contact data and the rules.
 */
export type ProfileSource = {
  profileVersionId: string;
  // The version's number, as the editor shows it.
  profileVersionNumber: number;
  header: ResumeHeaderFields;
  positions: SourcePosition[];
  evidence: SourceEvidence[];
  credentials: SourceCredential[];
  skills: Array<{ id: string; name: string; evidenceIds: string[] }>;
  // Each fit check passage's lines here, since a passage may hold several.
  evidenceOfPassage: Map<string, string[]>;
  rules: { neverInclude: string[]; neverClaim: string[] };
  // What the profile says the person lacks: never claimed in a document.
  studied: string[];
  gaps: string[];
};

/** What a writer reads where the profile has a figure it may not use. */
export const withheld = "[figure withheld]";

// A number standing on its own ("30%", "1,8", "3x"), not the digits of a
// name (EC2, B2B, S3) nor a year, which dates a fact and measures nothing.
const standaloneNumber =
  /(?<![\p{L}\p{N}])(?!(?:19|20)\d{2}(?![\d%]|[.,]\d))\d+(?:[.,]\d+)*%?/gu;

/**
 * A profile line as generation may use it. A figure enters a document only
 * when the profile marks it measured; one marked estimated or to confirm is
 * withheld, so the line can still be told without it; an unmarked number in
 * a result is withheld too, since nothing says where it comes from. What is
 * marked as having no number is told as written. Marks themselves never
 * reach a document.
 */
export function readFigures(line: string, isResult: boolean) {
  const marks = findMarks(line);
  let text = "";
  let figures = "";
  let cursor = 0;
  const add = (segment: string, usable: boolean) => {
    text += usable ? segment : segment.replace(standaloneNumber, withheld);
    // What is left of a withheld segment still backs the names in it.
    figures += ` ${usable ? segment : segment.replace(standaloneNumber, " ")}`;
  };
  for (const mark of marks) {
    add(
      line.slice(cursor, mark.from),
      mark.mark === "measured" || mark.mark === "noNumber"
    );
    cursor = mark.to;
  }
  const rest = line.slice(cursor);
  // What follows the last mark (or a line with none): a fact as written,
  // unless it is a result's figure nobody marked.
  add(rest, !(isResult && rest.search(standaloneNumber) >= 0));
  return {
    text: text
      .replace(/\s+([.,;])/g, "$1")
      .replace(/\s{2,}/g, " ")
      .trim(),
    figures: figures
      .replace(/\s+([.,;])/g, "$1")
      .replace(/\s{2,}/g, " ")
      .trim(),
  };
}

const headerLabels: Record<string, keyof ResumeHeaderFields> = {
  "nome profissional": "name",
  "professional name": "name",
  nome: "name",
  name: "name",
  "e-mail profissional": "email",
  "professional email": "email",
  "e-mail": "email",
  email: "email",
  telefone: "phone",
  phone: "phone",
  "cidade e uf": "city",
  "city and state": "city",
  cidade: "city",
  city: "city",
  linkedin: "linkedin",
  "site ou portfolio": "github",
  "website or portfolio": "github",
  site: "github",
  website: "github",
  portfolio: "github",
  github: "github",
};

const evidenceKindOf: Record<ExperienceField, EvidenceKind> = {
  context: "responsibility",
  responsibilities: "responsibility",
  tools: "tool",
  results: "achievement",
  notDone: "responsibility",
};

const month = /\d{4}-(?:0[1-9]|1[0-2])/;

/**
 * Reads a published version for generation. Code prints the locked facts
 * and the credentials from here, and every written line must rest on one of
 * these evidence lines.
 */
export function readProfileSource(input: {
  // The user's career profile: positions keep their ids across versions.
  careerProfileId: string;
  profile: PublishedProfile;
}): ProfileSource {
  const { profile } = input;
  const blocks = parseBlocks(profile.markdown);
  const structure = readStructure(blocks);

  const experiences = structure.experiences.map((experience) => ({
    rawTitle: experience.rawTitle,
    position: experience.parsed
      ? {
          id: positionIdOf(input.careerProfileId, experience.parsed),
          employer: experience.parsed.company,
          title: experience.parsed.title,
          startDate: experience.parsed.range.start,
          endDate: month.test(experience.parsed.range.end)
            ? experience.parsed.range.end
            : null,
          notDone: [] as string[],
        }
      : null,
  }));
  profile.extract.experiences.forEach((extracted) => {
    const match = experiences.find(
      (experience) =>
        experience.position?.employer === extracted.company &&
        experience.position.title === extracted.title &&
        experience.position.startDate === extracted.start
    );
    if (match?.position) match.position.notDone = extracted.notDone;
  });

  const header: ResumeHeaderFields = {
    name: "",
    email: "",
    phone: "",
    linkedin: "",
    github: "",
    city: "",
  };
  const evidence: SourceEvidence[] = [];
  const credentials: SourceCredential[] = [];
  const evidenceOfPassage = new Map<string, string[]>();
  const competencyPassage = new Map<string, string>();

  for (const passage of profile.passages) {
    if (passage.kind !== "evidence") continue;
    const experience =
      passage.experience === null ? null : experiences[passage.experience];
    const [first = "", ...children] = passage.text.split("\n");
    const head =
      experience && first.startsWith(`${experience.rawTitle}: `)
        ? first.slice(experience.rawTitle.length + 2)
        : first;
    const labelled = splitLabel(head);

    if (passage.section === "identity" || passage.section === "contact") {
      const field = labelled && headerLabels[normalizeLabel(labelled.label)];
      if (field) {
        // A website and a GitHub line share the header's last slot.
        header[field] = [header[field], labelled.value]
          .filter(Boolean)
          .join(" | ");
        continue;
      }
      // Contact data is printed by code, never handed to a writer.
      if (passage.section === "contact") continue;
    }
    if (passage.section === "education") {
      const [title, institution, status] = head.split(/\s+—\s+/);
      credentials.push({
        id: passage.id,
        kind: "education",
        title: title.trim(),
        institution: institution?.trim() || null,
        level: null,
        startDate: null,
        endDate: (status && month.exec(status)?.[0]) ?? null,
        inProgress: /em andamento|in progress/i.test(head),
      });
      continue;
    }
    if (passage.section === "certifications") {
      const [title, issuer, date, status] = head.split(/\s+—\s+/);
      credentials.push({
        id: passage.id,
        kind: "certification",
        title: title.trim(),
        institution: issuer?.trim() || null,
        // Its real status, as the profile writes it (valid, expired…).
        level: status?.trim() || null,
        startDate: null,
        endDate: (date && month.exec(date)?.[0]) ?? null,
        inProgress: false,
      });
      continue;
    }
    if (passage.section === "languages") {
      const [title, level] = head.split(/\s+—\s+/);
      credentials.push({
        id: passage.id,
        kind: "language",
        title: title.trim(),
        institution: null,
        level: level?.trim() || null,
        startDate: null,
        endDate: null,
        inProgress: false,
      });
      continue;
    }

    const field =
      experience && labelled ? experienceFieldOf(labelled.label) : null;
    const label = field && labelled ? `${labelled.label.trim()}: ` : "";
    const lines = [field && labelled ? labelled.value : head, ...children];
    const ids: string[] = [];
    lines.forEach((line, index) => {
      if (!line.trim()) return;
      const id = index === 0 ? passage.id : stableId(passage.id, `${index}`);
      const read = readFigures(line, field === "results");
      ids.push(id);
      evidence.push({
        id,
        positionId: experience?.position?.id ?? null,
        kind: field ? evidenceKindOf[field] : "responsibility",
        text: `${label}${read.text}`,
        figures: read.figures,
      });
    });
    evidenceOfPassage.set(passage.id, ids);
    if (passage.section === "competencies") {
      competencyPassage.set(normalizeLabel(head), passage.id);
    }
  }

  // A competency only studied is never a skill of the resume.
  const skills = profile.extract.competencies
    .filter((competency) => competency.level !== "studied")
    .map((competency) => {
      const name = normalizeLabel(competency.name);
      const passageId = [...competencyPassage.entries()].find(([line]) =>
        mentions(line, competency.name)
      )?.[1];
      return {
        id: stableId(input.careerProfileId, "skill", name),
        name: competency.name,
        evidenceIds: passageId ? [passageId] : [],
      };
    });

  return {
    profileVersionId: profile.versionId,
    profileVersionNumber: profile.number,
    header,
    positions: experiences
      .flatMap((experience) => experience.position ?? [])
      .sort(
        (a, b) =>
          (b.endDate ?? "9999").localeCompare(a.endDate ?? "9999") ||
          (b.startDate ?? "").localeCompare(a.startDate ?? "")
      ),
    evidence,
    credentials,
    skills,
    evidenceOfPassage,
    rules: profile.extract.rules,
    studied: profile.extract.competencies
      .filter((competency) => competency.level === "studied")
      .map((competency) => competency.name),
    gaps: profile.extract.gaps,
  };
}
