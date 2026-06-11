import { spawn } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function resolve(url: string) {
  return new URL(url, `file://${fileURLToPath(import.meta.url)}`).pathname;
}

const rootDir = resolve("../../..");
const intlDir = resolve("..");

const LOCALES = ["en-US", "pt-BR"];

function mergeExtractedMessages(locale: string) {
  const finalPath = `${intlDir}/extracted/${locale}.json`;
  const tmpPath = `${intlDir}/extracted/.tmp-${locale}.json`;

  function readJson(path: string): Record<string, unknown> {
    try {
      return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  const prevContents = readJson(finalPath);
  const nextContents = readJson(tmpPath);

  const mergedContents: Record<string, unknown> = {};

  for (const k of Object.keys(prevContents)) {
    if (Object.prototype.hasOwnProperty.call(nextContents, k)) {
      mergedContents[k] = prevContents[k];
    }
  }

  for (const k of Object.keys(nextContents)) {
    if (!Object.prototype.hasOwnProperty.call(mergedContents, k)) {
      mergedContents[k] = nextContents[k];
    }
  }

  const sorted = Object.fromEntries(
    Object.entries(mergedContents).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  );

  const prevRaw = JSON.stringify(prevContents, null, 2) + "\n";
  const mergedRaw = JSON.stringify(sorted, null, 2) + "\n";

  if (prevRaw !== mergedRaw) {
    writeFileSync(finalPath, mergedRaw, "utf8");
  }

  rmSync(tmpPath, { force: true });
}

function extractOne(locale: string): Promise<number> {
  return new Promise((resolve) => {
    const event = spawn(
      "pnpm",
      [
        "formatjs",
        "extract",
        `${rootDir}/{apps,packages}/*/src/**/*.{ts,tsx}`,
        `--format=lokalise`,
        `--ignore=**/*.d.ts`,
        `--out-file=${intlDir}/extracted/.tmp-${locale}.json`,
      ],
      { cwd: rootDir }
    );

    event.on("exit", (code) => {
      if (code === 0) mergeExtractedMessages(locale);
      resolve(code ?? 0);
    });

    event.stderr.on("data", (data) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, no-console
      console.error(data.toString());
    });
  });
}

async function main() {
  for (const locale of LOCALES) {
    const code = await extractOne(locale);
    if (code !== 0) process.exit(code);
  }
}

void main();
