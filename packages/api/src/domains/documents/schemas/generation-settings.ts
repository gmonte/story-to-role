import { z } from "zod";

/**
 * The user's generation settings (resume spec, "Generation settings"):
 * global defaults, shown as a form each time a document is generated and
 * changed there for that document only. Code enforces them.
 */
export const generationSettingsSchema = z.object({
  // Bullets of an experience that is current or ended at most
  // `recentYears` ago.
  bulletsRecent: z.number().int().min(1).max(8),
  recentYears: z.number().int().min(1).max(40),
  bulletsOlder: z.number().int().min(0).max(5),
  // An experience that ended `veryOldYears` ago or more: left out unless
  // it matches the document's purpose, left out always, or kept like an
  // older one.
  veryOld: z.enum(["relevant_only", "leave_out", "keep"]),
  veryOldYears: z.number().int().min(2).max(60),
  resumeMaxPages: z.number().int().min(1).max(4),
  letterMaxParagraphs: z.number().int().min(2).max(8),
  letterMaxPages: z.number().int().min(1).max(2),
});
export type GenerationSettings = z.infer<typeof generationSettingsSchema>;

export const defaultGenerationSettings: GenerationSettings = {
  bulletsRecent: 3,
  recentYears: 5,
  bulletsOlder: 1,
  veryOld: "relevant_only",
  veryOldYears: 15,
  resumeMaxPages: 2,
  letterMaxParagraphs: 4,
  letterMaxPages: 1,
};

export type ExperienceAge = "recent" | "older" | "very_old";

/**
 * How old an experience is to a document, by when it ended: current ones
 * are recent. `today` is a month (YYYY-MM).
 */
export function experienceAge(
  position: { endDate: string | null },
  settings: Pick<GenerationSettings, "recentYears" | "veryOldYears">,
  today: string
): ExperienceAge {
  if (!position.endDate) return "recent";
  const months = (value: string) =>
    Number(value.slice(0, 4)) * 12 + Number(value.slice(5, 7));
  const years = (months(today) - months(position.endDate)) / 12;
  if (years >= settings.veryOldYears) return "very_old";
  return years <= settings.recentYears ? "recent" : "older";
}
