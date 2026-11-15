import { vi } from "vitest";

import type {
  AiAgentRequest,
  AiUsage,
  ProviderPackage,
} from "@repo/api/domains/ai/providers/provider-package";

export const fakeUsage = (model = "claude-haiku-5-5"): AiUsage => ({
  model,
  inputTokens: 100,
  outputTokens: 10,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
});

/**
 * A provider package for tests: no network, scripted answers. `agent` plays
 * the model in a tool loop: it may call the request's tools through
 * `callTool`, which runs the real handlers (and their validations).
 */
export function fakeProviderPackage(script: {
  object?: (request: { system: string; purpose?: string }) => unknown;
  text?: (request: { system: string }) => string;
  agent?: (
    request: AiAgentRequest,
    callTool: (name: string, input: unknown) => Promise<string>
  ) => Promise<string>;
  search?: (request: { system: string }) => {
    text: string;
    sources: Array<{ url: string; title: string }>;
  };
}) {
  const generateObject = vi.fn(async (request: { system: string }) => ({
    object: (await script.object?.(request)) as never,
    usage: fakeUsage(),
  }));
  const generateText = vi.fn(async (request: { system: string }) => ({
    text: script.text?.(request) ?? "",
    usage: fakeUsage("claude-sonnet-5-5"),
  }));
  const runAgent = vi.fn(async (request: AiAgentRequest) => {
    const callTool = async (name: string, input: unknown) => {
      const tool = request.tools.find((candidate) => candidate.name === name);
      if (!tool) throw new Error(`No tool ${name}`);
      return tool.handler(tool.schema.parse(input));
    };
    const text = (await script.agent?.(request, callTool)) ?? "";
    return { text, usages: [fakeUsage("claude-sonnet-5-5")] };
  });

  const searchWeb = vi.fn(async (request: { system: string }) => ({
    ...(script.search?.(request) ?? { text: "", sources: [] }),
    usages: [fakeUsage("claude-sonnet-5-5")],
  }));

  const providerPackage: ProviderPackage = {
    provider: "anthropic",
    models: {
      classification: "claude-haiku-5-5",
      writing: "claude-sonnet-5-5",
      maximum: "claude-opus-5-5",
      research: "claude-sonnet-5-5",
    },
    generateObject,
    generateText,
    runAgent,
    searchWeb,
  };
  return { providerPackage, generateObject, generateText, runAgent, searchWeb };
}
