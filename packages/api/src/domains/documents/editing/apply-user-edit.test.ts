import { describe, expect, it } from "vitest";

import type { Line } from "../schemas/document";
import { editedOrigin, markEditedLine, sameWords } from "./edited-origin";

const E1 = "00000000-0000-4000-8000-0000000000e1";
const I1 = "00000000-0000-4000-8000-0000000000a1";

describe("a user's edit of a traced line (resume spec, “Trace in the editor”)", () => {
  const traced: Line = {
    id: "l1",
    text: "Cut deploy time by 40% with Kubernetes.",
    origin: { kind: "evidence", evidenceIds: [E1] },
  };

  it("treats spacing and punctuation alone as no edit", () => {
    expect(sameWords("Cut deploy time.", "Cut  deploy time")).toBe(true);
    expect(sameWords("Cut deploy time.", "Cut deploy time, fast.")).toBe(false);
    expect(
      markEditedLine(
        { ...traced, text: "Cut deploy time by 40%, with Kubernetes " },
        traced
      ).origin
    ).toEqual(traced.origin);
  });

  it("keeps the line's id and sources as edited when its words change", () => {
    const edited = markEditedLine(
      { ...traced, text: "Cut deploy time by 40% using Kubernetes." },
      traced
    );
    expect(edited.id).toBe("l1");
    expect(edited.origin).toEqual({
      kind: "edited",
      evidenceIds: [E1],
      instructionIds: [],
      companyFactIds: [],
      motivationPointIds: [],
    });
    // Edited again: still edited, same sources.
    expect(editedOrigin(edited.origin)).toEqual(edited.origin);
    expect(
      editedOrigin({
        kind: "instruction",
        instructionIds: [I1],
        evidenceIds: [],
      })
    ).toMatchObject({ kind: "edited", instructionIds: [I1] });
  });

  it("marks a new line, or one with nothing to trace, as written by the user", () => {
    expect(markEditedLine({ ...traced, id: "new" }).origin).toEqual({
      kind: "manual",
    });
    expect(editedOrigin({ kind: "skill", evidenceIds: [] })).toEqual({
      kind: "manual",
    });
    expect(editedOrigin({ kind: "manual" })).toEqual({ kind: "manual" });
  });
});
