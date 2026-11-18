import type { ApplicationStatus } from "@repo/api/domains/applications/schemas/application";
import type {
  OpeningKind,
  OpeningStatus,
} from "@repo/api/domains/openings/schemas/opening";

/** The journey's steps, which are also the page's tabs (`?view=`). */
export const openingViews = [
  "opening",
  "fit",
  "resume",
  "letter",
  "application",
] as const;
export type OpeningView = (typeof openingViews)[number];

/**
 * The step the URL opens. Every step is a tab in every state, so an
 * unknown or missing value falls back to the opening itself; a step the
 * state keeps closed (nothing analyzed yet) does too.
 */
export function resolveView(
  requested: string | null,
  available: readonly OpeningView[] = openingViews
): OpeningView {
  const view = openingViews.find((candidate) => candidate === requested);
  return view && available.includes(view) ? view : "opening";
}

/** The steps a state lets the user open. */
export function availableViews(input: {
  status: OpeningStatus;
  hasApplication: boolean;
}): readonly OpeningView[] {
  switch (input.status) {
    case "analyzed":
    case "closed":
      return openingViews;
    case "external":
      return input.hasApplication ? ["opening", "application"] : ["opening"];
    case "processing":
    case "rejected":
      return ["opening"];
  }
}

export type PrimaryAction =
  | "go_to_career"
  | "answer_questions"
  | "generate_resume"
  | "write_letter"
  | "mark_applied"
  | "record_reply"
  | "reopen"
  | "analyze"
  | "add_again";

export type JourneyState = {
  status: OpeningStatus;
  kind: OpeningKind;
  /** A posted opening analyzed before any profile was published. */
  needsPublishedProfile: boolean;
  pendingGaps: number;
  resumeVersions: number;
  resumeGenerating: boolean;
  letterVersions: number;
  letterGenerating: boolean;
  applicationStatus: ApplicationStatus | null;
};

const closedApplication: ApplicationStatus[] = [
  "hired",
  "rejected",
  "withdrawn",
  "no_response",
];

/**
 * The header's one button: what the person would do next following the
 * method (design review, "Ação primária por estado"). `null` while
 * something runs (the center shows its progress) or when the journey is
 * over. It never blocks: a low fit still offers the resume.
 */
export function primaryAction(state: JourneyState): PrimaryAction | null {
  switch (state.status) {
    case "processing":
      return null;
    case "rejected":
      return "add_again";
    case "external":
      return "analyze";
    case "closed":
      return "reopen";
    case "analyzed":
      break;
  }
  if (state.needsPublishedProfile) return "go_to_career";
  const application = state.applicationStatus;
  if (application && closedApplication.includes(application)) return null;
  if (
    application === "applied" ||
    application === "in_process" ||
    application === "offer"
  ) {
    return "record_reply";
  }
  if (state.resumeGenerating || state.letterGenerating) return null;
  if (state.pendingGaps > 0 && state.resumeVersions === 0) {
    return "answer_questions";
  }
  // With no vacancy to answer, the letter is the document that matters.
  if (state.kind === "unsolicited") {
    return state.letterVersions === 0 ? "write_letter" : "mark_applied";
  }
  if (state.resumeVersions === 0) return "generate_resume";
  if (state.letterVersions === 0) return "write_letter";
  return "mark_applied";
}
