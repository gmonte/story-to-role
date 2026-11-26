import type { ApplicationStatus } from "@repo/api/domains/applications/schemas/application";
import type {
  OpeningKind,
  OpeningStatus,
} from "@repo/api/domains/openings/schemas/opening";

/**
 * The opening's pages (`?view=`): the opening itself (application,
 * description and fit on one screen) and the two documents, each a
 * full-screen page of its own.
 */
export const openingViews = ["opening", "resume", "letter"] as const;
export type OpeningView = (typeof openingViews)[number];

/**
 * The page the URL opens. An unknown or missing value (including the
 * old Fit and Application tabs) falls back to the opening itself, and so
 * does a page the state keeps closed (nothing analyzed yet).
 */
export function resolveView(
  requested: string | null,
  available: readonly OpeningView[] = openingViews
): OpeningView {
  const view = openingViews.find((candidate) => candidate === requested);
  return view && available.includes(view) ? view : "opening";
}

/** The pages a state lets the user open. */
export function availableViews(input: {
  status: OpeningStatus;
  // An analyzed opening being checked again keeps its pages.
  rechecking?: boolean;
}): readonly OpeningView[] {
  if (input.rechecking) return openingViews;
  switch (input.status) {
    case "analyzed":
    case "closed":
      return openingViews;
    case "unanalyzed":
    case "processing":
    case "failed":
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
  | "retry_analysis"
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
    case "failed":
      return "retry_analysis";
    case "unanalyzed":
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

/** What the phone's bottom bar does with the state's primary action. */
export type PhoneActionTarget =
  | { kind: "sheet"; sheet: "fit" | "application" }
  | { kind: "view"; view: Exclude<OpeningView, "opening"> };

/**
 * The bar's third button: where the state's next step lives on a phone.
 * Answering questions opens the Fit sheet, the documents open their pages
 * and marking as applied (or recording a reply) opens the Application
 * sheet. The other actions (analyze, reopen, go to My career, add again)
 * stay in the header, so the bar has none then.
 */
export function phoneActionTarget(
  action: PrimaryAction | null
): PhoneActionTarget | null {
  switch (action) {
    case "answer_questions":
      return { kind: "sheet", sheet: "fit" };
    case "generate_resume":
      return { kind: "view", view: "resume" };
    case "write_letter":
      return { kind: "view", view: "letter" };
    case "mark_applied":
    case "record_reply":
      return { kind: "sheet", sheet: "application" };
    case "go_to_career":
    case "reopen":
    case "analyze":
    case "retry_analysis":
    case "add_again":
    case null:
      return null;
  }
}
