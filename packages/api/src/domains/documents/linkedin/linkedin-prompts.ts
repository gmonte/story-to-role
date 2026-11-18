import { z } from "zod";

import { draftLine } from "../generation/assemble-resume";
import type { GenerationSettings } from "../schemas/generation-settings";

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
  about: z.object({
    // 3 to 5 short paragraphs; code joins them with a blank line.
    paragraphs: z.array(z.string()),
    evidence_ids: z.array(z.string()),
  }),
  experience: z.array(
    z.object({ position_id: z.string(), bullets: z.array(draftLine) })
  ),
});
export type LinkedinDraft = z.infer<typeof linkedinDraftSchema>;

/** The purpose block of the writer's material (see `resumeMaterial`). */
export const linkedinPurposeLines = [
  "A LinkedIn profile text with no opening behind it: the “About” section and, for each position, its experience text. It favours no specialty: tell the career as the profile states it, bringing forward each position's strongest points.",
];

export function linkedinPrompt(material: string, settings: GenerationSettings) {
  const veryOld = {
    relevant_only: `A very old position (ended ${settings.veryOldYears} years ago or more) has no requirement to answer here: write nothing for it.`,
    leave_out: `A very old position (ended ${settings.veryOldYears} years ago or more) is left out: write nothing for it.`,
    keep: "A very old position is written like an older one.",
  }[settings.veryOld];
  return [
    "You write a person's LinkedIn text from their career profile, which is the only source of facts: the About section and each position's experience text. It is read by people, not by a filter: natural, as the person would speak, never a list of keywords.",
    "Rules, enforced by code after you answer:",
    "- about: 3 to 5 short paragraphs, in the first person unless the style profile says otherwise, as the person would speak. evidence_ids lists the profile lines (or instructions) the About rests on; with none it is deleted.",
    `- experience: for each position, bullets: up to ${settings.bulletsRecent} for a recent position and ${settings.bulletsOlder} for an older one, leaner than a resume's, put first the strongest. Each bullet cites, in evidence_ids, lines of its own position only; a bullet without any is deleted.`,
    `- ${veryOld}`,
    "- A figure appears only when the line it cites shows it; a line carrying any other number is deleted. A result with “[figure withheld]” is told as a qualitative one.",
    "- Never write employers, titles or dates: code prints them. No headline, no list of skills, no hashtags.",
    "- Invent nothing: no technology, figure, certification or responsibility the profile doesn't state. Never claim what a position says the person did not do, nor a competency only studied, nor what the communication rules forbid.",
    "",
    material,
  ].join("\n");
}
