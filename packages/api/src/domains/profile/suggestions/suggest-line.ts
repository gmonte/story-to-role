import { TRPCError } from "@trpc/server";

import {
  positionIdOf,
  projectIdOf,
} from "@repo/api/domains/documents/generation/profile-source";
import type { UserCipher } from "@repo/api/domains/encryption/user-cipher";
import type { DbClient } from "@repo/api/tools/db-client";

import { ProfileRepository } from "../profile-repository";
import { blockToLine, parseBlocks, type ProfileBlock } from "../truth/blocks";
import { experienceKeys, projectKeys } from "../truth/chunks";
import {
  experienceFieldLabels,
  normalizeLabel,
  projectFieldLabels,
  type ExperienceField,
  type ProfileLanguage,
  translationLanguageOf,
  translationLineLabels,
} from "../truth/sections";
import { readStructure, sectionOf, splitLabel } from "../truth/structure";
import type { ProfileSuggestionOrigin } from "../schemas/profile";
import type { ProfileChange } from "../truth/suggestions";
import { proposeSuggestion, readSuggestionContent } from "./propose-suggestion";

/** Where in the profile a line a user stated is proposed to go. */
export type SuggestionTarget =
  // A labelled field of one experience, found by the position's derived id.
  | { kind: "experience"; positionId: string; field: ExperienceField }
  // A labelled field of one project, found by the project's derived id.
  | { kind: "project"; projectId: string; field: ExperienceField }
  // The end of a section (its known gaps, its competencies).
  | { kind: "section"; section: "gaps" | "competencies" }
  // The career direction line of Professional identity.
  | { kind: "careerDirection" }
  // The seniority and areas line of Professional identity: a general
  // strength not tied to any position.
  | { kind: "identityAreas" }
  // The translations dictionary line for one language, under
  // Communication rules; the text is an entry (`original → translation`).
  | { kind: "translation"; language: ProfileLanguage };

const careerDirectionLabels: Record<ProfileLanguage, string> = {
  "pt-BR": "Direção de carreira (o que busco)",
  "en-US": "Career direction (what I look for)",
};
const careerDirectionAliases = ["career direction", "direcao de carreira"];
const identityAreasLabels: Record<ProfileLanguage, string> = {
  "pt-BR": "Senioridade e áreas",
  "en-US": "Seniority and areas",
};
const identityAreasAliases = ["seniority and areas", "senioridade e areas"];

const depthOf = (block: ProfileBlock) =>
  block.type === "item" ? block.depth : 0;

/**
 * Proposes a line the user stated (an application's instruction, a
 * motivation answer, a confirmed gap, a document line) as a suggestion in
 * the current draft of their profile (profile spec, "Suggestions"; origin
 * `application`, or `document` for a line of a document): never a change,
 * the user accepts it there. The line goes after the last
 * item of its target, or opens the target when it has none; an experience
 * is found by the position's derived id, so a renamed one is refused (or
 * goes to `fallback`) rather than guessed. Refusals are the caller's bad
 * request; a line the profile already has, a conflict.
 */
export async function suggestLine(input: {
  db: DbClient;
  cipher: UserCipher;
  userId: string;
  careerProfileId: string;
  target: SuggestionTarget;
  // Where it goes when the target's experience is no longer in the draft.
  fallback?: SuggestionTarget;
  // In the draft's language when it is given per language.
  text: string | Record<ProfileLanguage, string>;
  // In the draft's language when it is given per language.
  reason: string | Record<ProfileLanguage, string>;
  origin?: ProfileSuggestionOrigin;
}): Promise<{ profileSuggestionId: string }> {
  const repository = new ProfileRepository(input.db);
  const document = await repository.findDocument(input.userId, "profile");
  if (!document) throw new TRPCError({ code: "NOT_FOUND" });
  const blocks = parseBlocks(input.cipher.decrypt(document.encryptedDraft));
  const structure = readStructure(blocks);
  const language = structure.language;
  const text = (
    typeof input.text === "string" ? input.text : input.text[language]
  ).trim();
  const added = (depth: number): ProfileBlock => ({
    type: "item",
    depth,
    text,
  });
  const badRequest = (message: string) =>
    new TRPCError({ code: "BAD_REQUEST", message });

  /** The change for a target, or null when the draft lacks its place. */
  const changeFor = (target: SuggestionTarget): ProfileChange | null => {
    if (target.kind === "experience" || target.kind === "project") {
      const isProject = target.kind === "project";
      const index = isProject
        ? structure.projects.findIndex(
            (project) =>
              project.parsed &&
              projectIdOf(input.careerProfileId, project.parsed) ===
                target.projectId
          )
        : structure.experiences.findIndex(
            (experience) =>
              experience.parsed &&
              positionIdOf(input.careerProfileId, experience.parsed) ===
                target.positionId
          );
      if (index < 0) return null;
      const part = (
        isProject ? projectKeys(structure) : experienceKeys(structure)
      )[index];
      const entry = isProject
        ? structure.projects[index]
        : structure.experiences[index];
      const field = entry.fields[target.field];
      const labels = isProject ? projectFieldLabels : experienceFieldLabels;
      // After the field's last item, or under the field itself when it has
      // none; a draft without the field gets it at the end of the entry.
      const last = field?.children.at(-1);
      const anchor =
        last !== undefined ? blocks[last] : field ? blocks[field.line] : null;
      if (!anchor) {
        return {
          part,
          find: "",
          replace: [
            `- ${labels[language][target.field]}:`,
            blockToLine(added(1)),
          ].join("\n"),
        };
      }
      return {
        part,
        find: blockToLine(anchor),
        replace: [anchor, added(depthOf(anchor) + (last === undefined ? 1 : 0))]
          .map(blockToLine)
          .join("\n"),
      };
    }
    if (target.kind === "section") {
      const section = sectionOf(structure, target.section);
      if (!section) return null;
      return { part: target.section, find: "", replace: blockToLine(added(0)) };
    }
    if (target.kind === "translation") {
      const section = sectionOf(structure, "rules");
      if (!section) return null;
      let label = -1;
      for (let line = section.start; line < section.end; line++) {
        const block = blocks[line];
        const labelled =
          block.type === "item" && block.depth === 0
            ? splitLabel(block.text)
            : null;
        if (
          labelled &&
          translationLanguageOf(labelled.label) === target.language
        ) {
          label = line;
          break;
        }
      }
      if (label < 0) {
        return {
          part: "rules",
          find: "",
          replace: [
            blockToLine({
              type: "item",
              depth: 0,
              text: `${translationLineLabels[language][target.language]}:`,
            }),
            blockToLine(added(1)),
          ].join("\n"),
        };
      }
      // Entries written on the line itself: one more, after a “; ”.
      const labelled = splitLabel(blocks[label].text);
      if (labelled?.value.trim()) {
        const line = blocks[label];
        const value = labelled.value.trim().replace(/[.;]$/, "");
        return {
          part: "rules",
          find: blockToLine(line),
          replace: blockToLine({
            ...line,
            text: `${line.text.slice(0, line.text.indexOf(":") + 1)} ${value}; ${text}`,
          }),
        };
      }
      // Listed under it: one more sub-item, after the others.
      let last = label;
      while (
        last + 1 < section.end &&
        blocks[last + 1].type === "item" &&
        depthOf(blocks[last + 1]) > 0
      ) {
        last++;
      }
      const anchor = blocks[last];
      return {
        part: "rules",
        find: blockToLine(anchor),
        replace: [anchor, added(last === label ? 1 : depthOf(anchor))]
          .map(blockToLine)
          .join("\n"),
      };
    }
    const section = sectionOf(structure, "identity");
    if (!section) return null;
    const areas = target.kind === "identityAreas";
    const aliases = areas ? identityAreasAliases : careerDirectionAliases;
    const missingLabel = areas
      ? identityAreasLabels[language]
      : careerDirectionLabels[language];
    let label = -1;
    for (let line = section.start; line < section.end; line++) {
      const block = blocks[line];
      const labelled =
        block.type === "item" && block.depth === 0
          ? splitLabel(block.text)
          : null;
      if (labelled && aliases.includes(normalizeLabel(labelled.label))) {
        label = line;
        break;
      }
    }
    if (label < 0) {
      return {
        part: "identity",
        find: "",
        replace: [
          blockToLine({
            type: "item",
            depth: 0,
            text: `${missingLabel}:`,
          }),
          blockToLine(added(1)),
        ].join("\n"),
      };
    }
    // The point goes under the line, after the points already there.
    let last = label;
    while (
      last + 1 < section.end &&
      blocks[last + 1].type === "item" &&
      depthOf(blocks[last + 1]) > 0
    ) {
      last++;
    }
    const anchor = blocks[last];
    return {
      part: "identity",
      find: blockToLine(anchor),
      replace: [anchor, added(last === label ? 1 : depthOf(anchor))]
        .map(blockToLine)
        .join("\n"),
    };
  };

  const change =
    changeFor(input.target) ??
    (input.fallback ? changeFor(input.fallback) : null);
  if (!change) throw badRequest("The draft no longer has this place.");
  // Accepted already: the profile has it.
  if (blocks.some((block) => block.text.trim() === text)) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "Your profile already has this line.",
    });
  }
  const pending = (await repository.listPendingSuggestions(document.id)).map(
    (row) => ({ id: row.id, ...readSuggestionContent(input.cipher, row) })
  );
  // Sent already and still waiting: the same suggestion, not a second one.
  const waiting = pending.find(
    (row) =>
      row.part === change.part &&
      row.replace.split("\n").some((line) => line.includes(text))
  );
  if (waiting) return { profileSuggestionId: waiting.id };
  const proposed = await proposeSuggestion({
    db: input.db,
    cipher: input.cipher,
    documentId: document.id,
    draft: blocks,
    origin: input.origin ?? "application",
    change,
    reason:
      typeof input.reason === "string" ? input.reason : input.reason[language],
    // The line is the user's own statement: its figures are theirs.
    sources: [text],
    pending,
  });
  if (!proposed.ok) {
    throw badRequest(`The suggestion was refused: ${proposed.refusal.kind}.`);
  }
  return { profileSuggestionId: proposed.suggestion.id };
}
