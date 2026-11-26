import { describe, expect, it } from "vitest";

import {
  availableViews,
  type JourneyState,
  phoneActionTarget,
  primaryAction,
  resolveView,
} from "./opening-journey";

describe("phoneActionTarget", () => {
  it("sends the questions to the Fit sheet", () => {
    expect(phoneActionTarget("answer_questions")).toEqual({
      kind: "sheet",
      sheet: "fit",
    });
  });

  it("opens the document pages for writing", () => {
    expect(phoneActionTarget("generate_resume")).toEqual({
      kind: "view",
      view: "resume",
    });
    expect(phoneActionTarget("write_letter")).toEqual({
      kind: "view",
      view: "letter",
    });
  });

  it("opens the Application sheet to apply or record a reply", () => {
    expect(phoneActionTarget("mark_applied")).toEqual({
      kind: "sheet",
      sheet: "application",
    });
    expect(phoneActionTarget("record_reply")).toEqual({
      kind: "sheet",
      sheet: "application",
    });
  });

  it("has none when the header carries the action or nothing applies", () => {
    expect(phoneActionTarget(null)).toBeNull();
    expect(phoneActionTarget("analyze")).toBeNull();
    expect(phoneActionTarget("reopen")).toBeNull();
    expect(phoneActionTarget("go_to_career")).toBeNull();
    expect(phoneActionTarget("add_again")).toBeNull();
    expect(phoneActionTarget("retry_analysis")).toBeNull();
  });
});

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
  it("opens the requested page", () => {
    expect(resolveView("resume")).toBe("resume");
    expect(resolveView("letter")).toBe("letter");
  });

  it("falls back to the opening for a missing or unknown value", () => {
    expect(resolveView(null)).toBe("opening");
    expect(resolveView("documents")).toBe("opening");
    // The old tabs now live on the opening page.
    expect(resolveView("fit")).toBe("opening");
    expect(resolveView("application")).toBe("opening");
  });

  it("falls back when the state keeps the page closed", () => {
    expect(
      resolveView("resume", availableViews({ status: "processing" }))
    ).toBe("opening");
    expect(
      resolveView("letter", availableViews({ status: "unanalyzed" }))
    ).toBe("opening");
  });
});

describe("availableViews", () => {
  it("opens every page of an analyzed or closed opening", () => {
    expect(availableViews({ status: "analyzed" })).toEqual([
      "opening",
      "resume",
      "letter",
    ]);
    expect(availableViews({ status: "closed" })).toHaveLength(3);
  });

  it("keeps a rejected, processing, failed or external opening on its own page", () => {
    for (const status of [
      "rejected",
      "processing",
      "failed",
      "unanalyzed",
    ] as const) {
      expect(availableViews({ status })).toEqual(["opening"]);
    }
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

  it("offers to try a failed analysis again", () => {
    expect(primaryAction({ ...analyzed, status: "failed" })).toBe(
      "retry_analysis"
    );
  });

  it("offers to analyze an external opening", () => {
    expect(primaryAction({ ...analyzed, status: "unanalyzed" })).toBe(
      "analyze"
    );
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
