import { del, get, put } from "@vercel/blob";

import type { Storage } from "./storage";

/**
 * Private blobs: never reachable by URL, only through the read-write token.
 * Keys are stored as given, without Vercel's random suffix, so a key always
 * points at the latest upload.
 */
export function createVercelBlobStorage({ token }: { token: string }): Storage {
  return {
    async put(key, body, { contentType }) {
      await put(key, body, {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType,
        token,
      });
    },

    async get(key) {
      const result = await get(key, {
        access: "private",
        useCache: false,
        token,
      });
      if (!result) return null;

      return Buffer.from(await new Response(result.stream).arrayBuffer());
    },

    async delete(key) {
      await del(key, { token });
    },
  };
}
