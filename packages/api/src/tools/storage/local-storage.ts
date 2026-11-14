import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type { Storage } from "./storage";

/**
 * Files under a git-ignored directory on the developer's machine. The env
 * schema only allows it when NEXT_PUBLIC_ENV=development.
 */
export function createLocalStorage({ rootDir }: { rootDir: string }): Storage {
  const root = path.resolve(rootDir);

  // Keys come from our own code, but never let one escape the root.
  function resolveKey(key: string) {
    const filePath = path.resolve(root, key);
    if (!filePath.startsWith(root + path.sep)) {
      throw new Error("Storage key escapes the storage root");
    }
    return filePath;
  }

  return {
    async put(key, body) {
      const filePath = resolveKey(key);
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, body);
    },

    async get(key) {
      try {
        return await readFile(resolveKey(key));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
    },

    async delete(key) {
      await rm(resolveKey(key), { force: true });
    },
  };
}
