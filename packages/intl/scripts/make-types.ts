import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

function resolve(url: string) {
  return new URL(url, `file://${fileURLToPath(import.meta.url)}`).pathname;
}

const rootDir = resolve("../../..");
const intlDir = resolve("..");

function main() {
  const event = spawn(
    "pnpm",
    [
      "formatjs",
      "extract",
      `${rootDir}/{apps,packages}/*/src/**/*.{ts,tsx}`,
      `--format=${intlDir}/scripts/extract-type-formatter.cjs`,
      `--ignore=**/*.d.ts`,
    ],
    { cwd: rootDir }
  );

  event.stderr.on("data", (data) => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, no-console
    console.error(data.toString());
  });

  event.on("exit", (code) => {
    process.exit(code ?? 0);
  });

  process.on("SIGINT", () => {
    event.kill("SIGINT");
  });
}

main();
