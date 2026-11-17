import { describe, expect, it } from "vitest";

import { findQuote } from "./verify-quote";

const turn =
  "At Acme I led the migration of 12 services to Kubernetes.\nIt cut deploy time from 2 hours to 15 minutes.";

describe("quote verification", () => {
  it("accepts a quote that is the user's exact words", () => {
    expect(findQuote(turn, "cut deploy time from 2 hours to 15 minutes")).toBe(
      "cut deploy time from 2 hours to 15 minutes"
    );
  });

  it("tolerates differences in spacing, line breaks and case", () => {
    expect(findQuote(turn, "kubernetes.  It cut deploy")).toBe(
      "Kubernetes.\nIt cut deploy"
    );
  });

  it("refuses words the user never said", () => {
    expect(findQuote(turn, "cut deploy time by 90%")).toBeNull();
    expect(findQuote(turn, "")).toBeNull();
  });
});
