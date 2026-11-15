import type { z } from "zod";

/**
 * The AI roles of the pipeline. A provider package maps each role to one of
 * its models; nothing else in the app names a model.
 */
export type AiRole = "classification" | "writing" | "maximum" | "research";

export type AiMessage = { role: "user" | "assistant"; content: string };

export type AiUsage = {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};

export type AiTextRequest = {
  role: AiRole;
  system: string;
  messages: AiMessage[];
  maxTokens: number;
};

export type AiObjectRequest<T> = AiTextRequest & { schema: z.ZodType<T> };

/**
 * A tool the agent may call. Code validates the input against `schema` and
 * runs `handler`; agents change state only through tools (guided interview
 * spec). A handler returns the text the model sees, or throws a
 * `ToolRefusal` to tell the model why the call was refused.
 */
export type AiTool = {
  name: string;
  description: string;
  schema: z.ZodObject;
  handler: (input: unknown) => Promise<string>;
};

export type AiAgentRequest = AiTextRequest & {
  tools: AiTool[];
  // Safety stop: how many model calls one agent turn may make.
  maxIterations: number;
};

export class ToolRefusal extends Error {}

/**
 * The provider refused the key or its credit ran out (guided interview
 * spec, "When a user's key runs out of credit or is refused"): the task
 * stops, nothing is charged, and the user is told why.
 */
export class KeyUnusableError extends Error {
  constructor(readonly reason: "out_of_credit" | "refused") {
    super(`The provider key is unusable: ${reason}`);
  }
}

/** A web search turn: the provider's own search tool, within a limit. */
export type AiSearchRequest = AiTextRequest & { maxSearches: number };

/** A page the search returned or the answer cited. */
export type AiSource = { url: string; title: string };

/** A certified mapping of every AI role to one provider's models. */
export type ProviderPackage = {
  provider: "anthropic";
  models: Record<AiRole, string>;
  /**
   * A minimal call that proves the key works (a saved key is "validated
   * with a minimal provider call"); throws KeyUnusableError when not.
   */
  validateKey(): Promise<void>;
  generateText(
    request: AiTextRequest
  ): Promise<{ text: string; usage: AiUsage }>;
  /** `object` is null when the model's answer doesn't match the schema. */
  generateObject<T>(
    request: AiObjectRequest<T>
  ): Promise<{ object: T | null; usage: AiUsage }>;
  /**
   * Runs the tool loop until the model answers in text. Reports the usage of
   * every model call it made.
   */
  runAgent(
    request: AiAgentRequest
  ): Promise<{ text: string; usages: AiUsage[] }>;
  /**
   * Answers with the provider's web search tool (company research only;
   * no other role has web access), reporting every page it found.
   */
  searchWeb(
    request: AiSearchRequest
  ): Promise<{ text: string; sources: AiSource[]; usages: AiUsage[] }>;
};
