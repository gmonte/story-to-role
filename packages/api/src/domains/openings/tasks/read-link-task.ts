import { task } from "@trigger.dev/sdk";

import { readLink } from "../links/read-link";

/**
 * The isolated link reader (workspace spec): this module imports no
 * database and no AI client, and the URL is its only input. It makes a plain
 * HTTP request (no browser, so no script on the page runs) and returns text.
 *
 * The one exception to "tasks receive only ids" (ADR 0003): with no database
 * access the URL has to travel in the payload, and the page text in the
 * output. Both are public third-party content, not the user's career; the
 * caller stores them encrypted only because they sit beside the opening.
 */
export const readLinkTask = task({
  id: "read_link",
  retry: { maxAttempts: 1 },
  maxDuration: 60,
  run: async ({ url }: { url: string }) => readLink(url),
});
