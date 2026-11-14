import { generateOpenApiDocument } from "trpc-to-openapi";
import { describe, expect, it, vi } from "vitest";

import { appRouter } from "./router";

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));

// /api/docs renders this document only when someone opens it, so a schema
// trpc-to-openapi rejects would otherwise fail in the browser, not in CI.
describe("OpenAPI document", () => {
  it("renders every procedure with openapi meta", () => {
    const document = generateOpenApiDocument(appRouter, {
      title: "StoryToRole API",
      version: "1.0.0",
      baseUrl: "http://localhost:3000/api/rest",
    });

    expect(Object.keys(document.paths ?? {})).toEqual(
      expect.arrayContaining(["/users/me", "/tasks/sample", "/chat/messages"])
    );
  });
});
