import type { z } from "zod";

/**
 * The AI roles of the pipeline. A provider package maps each role to one of
 * its models; nothing else in the app names a model.
 */
export type AiRole = "classification" | "writing" | "maximum";

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

/** A certified mapping of every AI role to one provider's models. */
export type ProviderPackage = {
  provider: "anthropic";
  models: Record<AiRole, string>;
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
};
