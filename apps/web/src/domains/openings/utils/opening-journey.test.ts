import { describe, expect, it } from "vitest";

import {
  availableViews,
  type JourneyState,
  primaryAction,
  resolveView,
} from "./opening-journey";

const analyzed: JourneyState = {
  status: "analyzed",
  kind: "posted",
  needsPublishedProfile: false,
  pendingGaps: 0,
  resumeVersions: 0,
  resumeGenerating: false,
  letterVersions: 0,
  letterGenerating: false,
  applicationStatus: null,
};

describe("resolveView", () => {
  it("opens the requested step", () => {
    expect(resolveView("fit")).toBe("fit");
    expect(resolveView("application")).toBe("application");
  });

  it("falls back to the opening for a missing or unknown value", () => {
    expect(resolveView(null)).toBe("opening");
    expect(resolveView("documents")).toBe("opening");
  });

  it("opens the resume step even before a resume exists", () => {
    expect(resolveView("resume")).toBe("resume");
  });

  it("falls back when the state keeps the step closed", () => {
    expect(
      resolveView(
        "resume",
        availableViews({ status: "processing", hasApplication: false })
      )
    ).toBe("opening");
    expect(
      resolveView(
        "application",
        availableViews({ status: "external", hasApplication: true })
      )
    ).toBe("application");
  });
});

describe("availableViews", () => {
  it("opens every step of an analyzed or closed opening", () => {
    expect(
      availableViews({ status: "analyzed", hasApplication: false })
    ).toHaveLength(5);
    expect(
      availableViews({ status: "closed", hasApplication: true })
    ).toHaveLength(5);
  });

  it("keeps a rejected or processing opening on its own step", () => {
    expect(
      availableViews({ status: "rejected", hasApplication: false })
    ).toEqual(["opening"]);
  });
});

describe("primaryAction", () => {
  it("shows nothing while the analysis runs", () => {
    expect(primaryAction({ ...analyzed, status: "processing" })).toBeNull();
  });

  it("offers to add a rejected opening again", () => {
    expect(primaryAction({ ...analyzed, status: "rejected" })).toBe(
      "add_again"
    );
  });

  it("offers to analyze an external opening", () => {
    expect(primaryAction({ ...analyzed, status: "external" })).toBe("analyze");
  });

  it("reopens a closed opening", () => {
    expect(primaryAction({ ...analyzed, status: "closed" })).toBe("reopen");
  });

  it("sends to My career when no profile is published", () => {
    expect(primaryAction({ ...analyzed, needsPublishedProfile: true })).toBe(
      "go_to_career"
    );
  });

  it("asks the gap questions before the first resume", () => {
    expect(primaryAction({ ...analyzed, pendingGaps: 2 })).toBe(
      "answer_questions"
    );
    expect(
      primaryAction({ ...analyzed, pendingGaps: 2, resumeVersions: 1 })
    ).toBe("write_letter");
  });

  it("walks resume, letter, then applying", () => {
    expect(primaryAction(analyzed)).toBe("generate_resume");
    expect(primaryAction({ ...analyzed, resumeVersions: 1 })).toBe(
      "write_letter"
    );
    expect(
      primaryAction({
        ...analyzed,
        resumeVersions: 1,
        letterVersions: 1,
        applicationStatus: "in_preparation",
      })
    ).toBe("mark_applied");
  });

  it("shows nothing while a document is being written", () => {
    expect(primaryAction({ ...analyzed, resumeGenerating: true })).toBeNull();
    expect(
      primaryAction({
        ...analyzed,
        resumeVersions: 1,
        letterGenerating: true,
      })
    ).toBeNull();
  });

  it("starts with the letter when there is no vacancy", () => {
    expect(primaryAction({ ...analyzed, kind: "unsolicited" })).toBe(
      "write_letter"
    );
    expect(
      primaryAction({ ...analyzed, kind: "unsolicited", letterVersions: 1 })
    ).toBe("mark_applied");
  });

  it("records what happened once applied", () => {
    expect(
      primaryAction({
        ...analyzed,
        resumeVersions: 1,
        applicationStatus: "applied",
      })
    ).toBe("record_reply");
    expect(
      primaryAction({ ...analyzed, applicationStatus: "in_process" })
    ).toBe("record_reply");
  });

  it("ends with a closed application", () => {
    expect(
      primaryAction({ ...analyzed, applicationStatus: "hired" })
    ).toBeNull();
    expect(
      primaryAction({ ...analyzed, applicationStatus: "withdrawn" })
    ).toBeNull();
  });
});
