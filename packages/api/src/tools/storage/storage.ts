import { existsSync } from "node:fs";
import path from "node:path";

import { env } from "@repo/common/env/web.env";

import { createLocalStorage } from "./local-storage";
import { createVercelBlobStorage } from "./vercel-blob-storage";

/**
 * Where uploaded and generated files live (imported resumes, rendered PDFs).
 * Keys are paths such as `users/<userId>/imports/<importId>.pdf`; callers
 * encrypt career content before `put`, so a driver only ever sees bytes.
 */
export type Storage = {
  put(
    key: string,
    body: Buffer,
    options: { contentType: string }
  ): Promise<void>;
  /** Resolves to null when nothing is stored under the key. */
  get(key: string): Promise<Buffer | null>;
  /** Deleting a missing key is not an error. */
  delete(key: string): Promise<void>;
};

let storage: Storage | undefined;

export function getStorage(): Storage {
  storage ??=
    env.STORAGE_DRIVER === "local"
      ? createLocalStorage({
          rootDir: path.join(findWorkspaceRoot(), ".storage"),
        })
      : // The env schema refuses vercel-blob without a token.
        createVercelBlobStorage({ token: env.BLOB_READ_WRITE_TOKEN! });

  return storage;
}

// Next.js runs from apps/web and the Trigger.dev worker from packages/api:
// both must share the git-ignored `.storage/` at the workspace root.
function findWorkspaceRoot() {
  let dir = process.cwd();
  while (!existsSync(path.join(dir, "pnpm-workspace.yaml"))) {
    const parent = path.dirname(dir);
    if (parent === dir) return process.cwd();
    dir = parent;
  }
  return dir;
}
