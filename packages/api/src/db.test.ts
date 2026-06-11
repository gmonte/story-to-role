import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, describe, expect, it } from "vitest";

import { closeTestDatabase, getTestDatabase } from "./test/pglite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, "../drizzle");
const metaDir = path.join(migrationsDir, "meta");

const sqlFiles = fs
  .readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

const journal = JSON.parse(
  fs.readFileSync(path.join(metaDir, "_journal.json"), "utf-8")
) as { entries: Array<{ tag: string }> };

const journalTags = new Set(journal.entries.map((e) => e.tag));

describe("database migrations", () => {
  afterAll(async () => {
    await closeTestDatabase();
  });

  it.each(sqlFiles)("%s should have a corresponding snapshot", (sqlFile) => {
    const prefix = sqlFile.split("_")[0];
    expect(fs.existsSync(path.join(metaDir, `${prefix}_snapshot.json`))).toBe(
      true
    );
  });

  it.each(sqlFiles)(
    "%s should have a corresponding journal entry",
    (sqlFile) => {
      const migrationName = sqlFile.replace(".sql", "");
      expect(journalTags.has(migrationName)).toBe(true);
    }
  );

  it("should run all migrations successfully", async () => {
    const db = await getTestDatabase();
    expect(db).toBeDefined();
  }, 30_000);
});
