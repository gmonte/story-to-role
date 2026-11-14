import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createLocalStorage } from "./local-storage";
import type { Storage } from "./storage";

describe("local storage", () => {
  let rootDir: string;
  let storage: Storage;

  beforeEach(async () => {
    rootDir = await mkdtemp(path.join(tmpdir(), "storage-"));
    storage = createLocalStorage({ rootDir });
  });

  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  it("reads back what was put, in nested keys", async () => {
    await storage.put("users/u1/imports/a.pdf", Buffer.from("resume"), {
      contentType: "application/pdf",
    });

    const body = await storage.get("users/u1/imports/a.pdf");
    expect(body?.toString()).toBe("resume");
  });

  it("overwrites a key", async () => {
    await storage.put("a.txt", Buffer.from("one"), {
      contentType: "text/plain",
    });
    await storage.put("a.txt", Buffer.from("two"), {
      contentType: "text/plain",
    });

    expect((await storage.get("a.txt"))?.toString()).toBe("two");
  });

  it("returns null for a missing key and deletes idempotently", async () => {
    await storage.put("a.txt", Buffer.from("one"), {
      contentType: "text/plain",
    });
    await storage.delete("a.txt");
    await storage.delete("a.txt");

    expect(await storage.get("a.txt")).toBeNull();
  });

  it("rejects keys that escape the root", async () => {
    await expect(
      storage.put("../outside.txt", Buffer.from("x"), {
        contentType: "text/plain",
      })
    ).rejects.toThrow("escapes");
  });
});
