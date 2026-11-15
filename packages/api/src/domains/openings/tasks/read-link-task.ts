import { task } from "@trigger.dev/sdk";

import { readLink } from "../links/read-link";

/**
 * The isolated link reader (workspace spec): this module imports no
 * database and no AI client, and the URL is its only input. It makes a plain
 * HTTP request (no browser, so no script on the page runs) and returns text.
 */
export const readLinkTask = task({
  id: "read_link",
  retry: { maxAttempts: 1 },
  maxDuration: 60,
  run: async ({ url }: { url: string }) => readLink(url),
});
