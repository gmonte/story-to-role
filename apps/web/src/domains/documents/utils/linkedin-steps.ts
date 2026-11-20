import type { LinkedinSectionKind } from "@repo/api/domains/documents/linkedin/linkedin-resume";
import type { LinkedinContent } from "@repo/api/domains/documents/schemas/linkedin-content";

export type LinkedinStepKey =
  | "headline"
  | "about"
  | "experiences"
  | "projects"
  | "education"
  | "credentials";

export type LinkedinStep = {
  key: LinkedinStepKey;
  // The section the step writes (`linkedin.regenerateSection`); null for
  // the certifications and languages, which code prints.
  section: string | null;
  written: boolean;
  // The section title the editor scrolls to.
  blockKind: LinkedinSectionKind;
};

/**
 * The guided flow's steps after the Goal (resume spec, "LinkedIn", "Step
 * by step"): one per section, in LinkedIn's order, Projects and Education
 * only when the profile has some.
 */
export function linkedinSteps(content: LinkedinContent): LinkedinStep[] {
  const steps: LinkedinStep[] = [
    {
      key: "headline",
      section: "headline",
      written: content.headlineOptions.length > 0 || !!content.headline,
      blockKind: "headline",
    },
    {
      key: "about",
      section: "about",
      written: content.about.text.trim() !== "",
      blockKind: "about",
    },
  ];
  if (content.experiences.length) {
    steps.push({
      key: "experiences",
      section: "experiences",
      written: content.experiences.some((row) => row.lines.length > 0),
      blockKind: "experience",
    });
  }
  if (content.projects.length) {
    steps.push({
      key: "projects",
      section: "projects",
      written: content.projects.some((row) => row.lines.length > 0),
      blockKind: "projects",
    });
  }
  if (content.education.length) {
    steps.push({
      key: "education",
      section: "education",
      written: content.education.some((row) => row.description),
      blockKind: "education",
    });
  }
  steps.push({
    key: "credentials",
    section: null,
    written: false,
    blockKind: content.certifications.length ? "certifications" : "languages",
  });
  return steps;
}

/** The step the flow opens on: the first AI step still to write. */
export const openStep = (steps: LinkedinStep[]): LinkedinStepKey =>
  steps.find((step) => step.section && !step.written)?.key ?? "credentials";
