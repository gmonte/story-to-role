import { describe, expect, it } from "vitest";

import { extractDocumentText } from "./extract-text";

const resume = `Ada Lovelace — Staff Engineer
Acme Corp, São Paulo — Staff Engineer, Jan 2021 – present
- Moved 12 services to Kubernetes, cutting deploys from 2 hours to 15 minutes.
Globex — Engineer, Mar 2017 – Dec 2020
- Built the billing system used by 2 million customers.
Education: BSc Computer Science, USP, 2016.`;

describe("document text extraction", () => {
  it("reads plain text and markdown truth files as they are", async () => {
    const result = await extractDocumentText({
      bytes: Buffer.from(resume),
      mimeType: "text/markdown",
    });
    expect(result).toEqual({ ok: true, text: resume });
  });

  it("refuses files too short to be a resume", async () => {
    expect(
      await extractDocumentText({
        bytes: Buffer.from("hi"),
        mimeType: "text/plain",
      })
    ).toEqual({ ok: false, reason: "too_short" });
  });

  it("reports an unreadable PDF instead of throwing", async () => {
    expect(
      await extractDocumentText({
        bytes: Buffer.from("not a pdf"),
        mimeType: "application/pdf",
      })
    ).toEqual({ ok: false, reason: "unreadable" });
  });
});
