import { z } from "zod";

import { bulletFormatRule } from "../writing/bullet-format";
import { draftLine } from "../generation/assemble-resume";
import type { GenerationSettings } from "../schemas/generation-settings";
import { headlineMaxLength } from "../schemas/linkedin-content";

/**
 * What a LinkedIn text is for: the person's career as the profile states
 * it. It stands in for the opening in the coverage review.
 */
export const careerFocus = "Career as the profile states it";

/**
 * What the writing model returns: wording and the evidence behind it,
 * never employers, titles or dates, which code prints.
 */
export const linkedinDraftSchema = z.object({
  // 3 to 5 options; code keeps the grounded ones and chooses the first.
  headlines: z.array(draftLine).catch([]),
  about: z.object({
    // 3 to 5 short paragraphs; code joins them with a blank line.
    paragraphs: z.array(z.string()),
    evidence_ids: z.array(z.string()),
  }),
  experience: z.array(
    z.object({ position_id: z.string(), bullets: z.array(draftLine) })
  ),
  // One entry per project, for LinkedIn's Projects section.
  projects: z
    .array(z.object({ project_id: z.string(), bullets: z.array(draftLine) }))
    .catch([]),
  // An education's description, only where profile lines back one.
  education: z
    .array(
      z.object({
        credential_id: z.string(),
        description: draftLine.nullable(),
      })
    )
    .catch([]),
});
export type LinkedinDraft = z.infer<typeof linkedinDraftSchema>;

/** The purpose block of the writer's material (see `resumeMaterial`). */
export const linkedinPurposeLines = [
  "A LinkedIn profile text with no opening behind it: headline options, the “About” section, for each position its experience text, for each project its text for LinkedIn's Projects section and, where the profile backs one, a short description of an education. It favours no specialty: tell the career as the profile states it, bringing forward each position's strongest points.",
];

export function linkedinPrompt(
  material: string,
  settings: GenerationSettings,
  // The profile's education, by id: what an education description names.
  education: Array<{ id: string; title: string; institution: string | null }>
) {
  const veryOld = {
    relevant_only: `A very old position (ended ${settings.veryOldYears} years ago or more) has no requirement to answer here: write nothing for it.`,
    leave_out: `A very old position (ended ${settings.veryOldYears} years ago or more) is left out: write nothing for it.`,
    keep: "A very old position is written like an older one.",
  }[settings.veryOld];
  return [
    "You write a person's LinkedIn text from their career profile, which is the only source of facts: headline options, the About section, each position's experience text, each project's and an education's description. It is read by people, not by a filter: natural, as the person would speak, never a list of keywords.",
    "Rules, enforced by code after you answer:",
    `- headlines: 3 to 5 different options, each at most ${headlineMaxLength} characters: how the person defines themselves professionally, their main area and what they bring, as the profile states it (“Tech Lead | Platform engineering and developer experience”). No hashtags, no emoji, no list of every technology. Each cites in evidence_ids the profile lines it rests on; an option with none, or longer than the limit, is deleted.`,
    "- about: 3 to 5 short paragraphs, in the first person unless the style profile says otherwise, as the person would speak. evidence_ids lists the profile lines (or instructions) the About rests on; with none it is deleted.",
    `- experience: for each position, bullets: up to ${settings.bulletsRecent} for a recent position and ${settings.bulletsOlder} for an older one, leaner than a resume's, put first the strongest. Each bullet cites, in evidence_ids, lines of its own position only; a bullet without any is deleted.`,
    `- ${veryOld}`,
    `- projects: for each project listed in the material (personal or side work, never a position), bullets like a position's by its age (${settings.bulletsRecent} recent, ${settings.bulletsOlder} older), each citing only lines of its own project; code prints the name, dates and link. Never write a project as a position.`,
    bulletFormatRule,
    "- A figure appears only when the line it cites shows it; a line carrying any other number is deleted. A result with “[figure withheld]” is told as a qualitative one.",
    `- education: for an education listed below, a description of one or two sentences only when profile lines tell something about it (a thesis, an honour, a project done there), citing them in evidence_ids; otherwise description is null. Never restate the course or the institution: code prints them.${education.length ? "" : " The profile lists no education: return an empty list."}`,
    ...education.map(
      (row) =>
        `  - ${row.id}: ${row.title}${row.institution ? `, ${row.institution}` : ""}`
    ),
    "- Never write employers, titles, institutions or dates: code prints them, as it prints the certifications and languages. No list of skills, no hashtags.",
    "- Invent nothing: no technology, figure, certification or responsibility the profile doesn't state. Never claim what a position says the person did not do, nor a competency only studied, nor what the communication rules forbid.",
    "",
    material,
  ].join("\n");
}

/**
 * What a LinkedIn section written again asks of the writer (resume spec,
 * "LinkedIn"): that section alone, by the same rules.
 */
export function linkedinSectionInstruction(
  section: string,
  kind: "headline" | "about" | "position" | "project" | "education"
) {
  const what = {
    headline: "the headline options",
    about: "the About section",
    position: `the experience text of the position ${section}`,
    project: `the text of the project ${section}`,
    education: `the description of the education ${section}`,
  }[kind];
  return `Write only ${what}, fresh, by the rules above; leave every other field empty. The person asked to write it again, so word it differently from a first attempt while keeping to the profile.`;
}
