import type { LanguageModel } from "ai";

const noUsage = {
  inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 0, text: 0, reasoning: 0 },
};
const stop = { unified: "stop", raw: "stop" } as const;

/**
 * A "model" that streams a fixed text and calls no provider: the career
 * chat's answers decided by code (off topic, cooling down, out of credits)
 * go through the same stream and transcript as the model's, at no cost.
 */
export function fixedReplyModel(text: string): LanguageModel {
  return {
    specificationVersion: "v3",
    provider: "storytorole",
    modelId: "fixed-reply",
    supportedUrls: {},
    doGenerate: () =>
      Promise.resolve({
        content: [{ type: "text", text }],
        finishReason: stop,
        usage: noUsage,
        warnings: [],
      }),
    doStream: () =>
      Promise.resolve({
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({ type: "stream-start", warnings: [] });
            controller.enqueue({ type: "text-start", id: "reply" });
            controller.enqueue({
              type: "text-delta",
              id: "reply",
              delta: text,
            });
            controller.enqueue({ type: "text-end", id: "reply" });
            controller.enqueue({
              type: "finish",
              finishReason: stop,
              usage: noUsage,
            });
            controller.close();
          },
        }),
      }),
  };
}
