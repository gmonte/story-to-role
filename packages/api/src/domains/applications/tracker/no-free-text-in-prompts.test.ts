import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Tracker spec: notes and next steps (free text, where names and contacts
 * end up) never reach a prompt. The tracker's free-text columns and its
 * event timeline are only read by the tracker itself and account deletion;
 * any other file (an AI task, a prompt builder) reading them fails here.
 */
const guarded = [
  "encryptedNextStep",
  "encryptedNotes",
  "encryptedDeclineReason",
  "encryptedSourceDetail",
  "applicationEventsTable",
];

const root = join(__dirname, "../../..");
const allowed = [
  "domains/applications/tracker/",
  "domains/applications/db/",
  "domains/account/account-repository.ts",
];

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}

describe("tracker free text", () => {
  it("is read by no file outside the tracker", () => {
    const offenders = files(root)
      .filter((path) => path.endsWith(".ts") && !path.endsWith(".test.ts"))
      .filter((path) => !allowed.some((a) => path.includes(`/${a}`)))
      .filter((path) => {
        const source = readFileSync(path, "utf8");
        return guarded.some((name) => {
          // The opening's own notes column shares a name with the guarded one.
          return name === "encryptedNotes"
            ? /applicationsTable[^;]*encryptedNotes/.test(source)
            : source.includes(name);
        });
      });
    expect(offenders).toEqual([]);
  });
});
