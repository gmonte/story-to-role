import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import { drizzle } from "drizzle-orm/pglite";

import * as schema from "../db";

let pglite: PGlite | undefined;

export async function getTestDatabase() {
  if (!pglite) {
    pglite = await PGlite.create({ extensions: { vector } });
    await pglite.waitReady;

    const migrationsPath = resolve(process.cwd(), "drizzle");
    await runMigrations(pglite, migrationsPath);
  }

  return drizzle(pglite, { schema });
}

async function runMigrations(client: PGlite, migrationsPath: string) {
  await client.exec(`
    CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
      id SERIAL PRIMARY KEY,
      hash TEXT NOT NULL,
      created_at BIGINT
    )
  `);

  const applied = await client.query<{ hash: string }>(
    "SELECT hash FROM __drizzle_migrations"
  );
  const appliedHashes = new Set(applied.rows.map((r) => r.hash));

  const journalPath = resolve(migrationsPath, "meta", "_journal.json");
  const journal = JSON.parse(readFileSync(journalPath, "utf-8")) as {
    entries: Array<{ idx: number; tag: string }>;
  };

  for (const entry of journal.entries) {
    const hash = entry.tag;
    if (appliedHashes.has(hash)) continue;

    const sqlPath = resolve(migrationsPath, `${entry.tag}.sql`);
    const sql = readFileSync(sqlPath, "utf-8");

    const hasBreakpoints = sql.includes("--> statement-breakpoint");

    if (hasBreakpoints) {
      const statements = sql
        .split("--> statement-breakpoint")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      for (const statement of statements) {
        await client.exec(statement);
      }
    } else {
      const statements = sql
        .split("\n")
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && !s.startsWith("--"));

      for (const statement of statements) {
        await client.exec(statement);
      }
    }

    await client.exec(
      `INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES ('${hash}', ${Date.now()})`
    );
  }
}

export async function clearTestDatabase() {
  if (!pglite) return;

  const tables = await pglite.query(`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
    AND tablename NOT LIKE '%migrations'
  `);

  for (const row of tables.rows) {
    const tableName = (row as { tablename: string }).tablename;
    try {
      await pglite.exec(`TRUNCATE TABLE "${tableName}" CASCADE`);
    } catch {
      // ignore if table no longer exists
    }
  }
}

export async function closeTestDatabase() {
  if (!pglite) return;
  await pglite.close();
  pglite = undefined;
}
