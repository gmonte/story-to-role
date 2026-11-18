import { foldAccents } from "@repo/api/utils/text/fold-accents";

/**
 * The words that count when two texts are compared: without accents,
 * case, punctuation or extra spaces, so a quote the agent typed matches
 * the person's words however they were spelled.
 */
export const normalizeWords = (text: string) =>
  foldAccents(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

const contains = (text: string, words: string) =>
  words.length > 0 && ` ${normalizeWords(text)} `.includes(` ${words} `);

/**
 * What the person said in this conversation, for a change to a locked
 * fact: every message of theirs, and the latest one with its quote and
 * attachment, which is what this turn is about.
 */
export type UserRequest = {
  said: string[];
  latest: string;
};

/**
 * Whether the person asked for a change to a locked fact: `requestedBy`
 * quotes their words asking for it, those words are in a message of
 * theirs in this conversation, and the latest message is about that
 * change (it carries the quote, the line changed or the new text).
 */
export function userRequested(
  request: UserRequest,
  requestedBy: string | undefined,
  change: { find: string; replace: string }
) {
  const quote = normalizeWords(requestedBy ?? "");
  if (!quote) return false;
  if (!request.said.some((message) => contains(message, quote))) return false;
  const topics = [
    quote,
    normalizeWords(change.find),
    normalizeWords(change.replace),
  ];
  return topics.some((topic) => contains(request.latest, topic));
}
