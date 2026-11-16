import { createElement } from "react";

import { Document, Page, renderToBuffer, Text } from "@react-pdf/renderer";
import { describe, expect, it } from "vitest";

import { previewDocument, renderPdfPage } from "./document-preview";

const pages = (count: number) =>
  renderToBuffer(
    createElement(
      Document,
      null,
      Array.from({ length: count }, (_, i) =>
        createElement(Page, { key: i }, createElement(Text, null, `Page ${i}`))
      )
    )
  );

describe("source preview", () => {
  it("counts a PDF's pages and renders each one as a PNG", async () => {
    const pdf = await pages(2);

    expect(
      await previewDocument({ bytes: pdf, mimeType: "application/pdf" })
    ).toEqual({ type: "pdf", pageCount: 2 });

    const png = await renderPdfPage({ bytes: pdf, page: 2 });
    // The PNG signature: an image, which can carry no script.
    expect(png?.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    );
    expect(await renderPdfPage({ bytes: pdf, page: 3 })).toBeNull();
  });
});
