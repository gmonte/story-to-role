import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

import type {
  AiRole,
  AiTextRequest,
  AiUsage,
  ProviderPackage,
} from "./provider-package";

const models: Record<AiRole, string> = {
  classification: "claude-haiku-5-5",
  writing: "claude-sonnet-5-5",
  maximum: "claude-opus-5-5",
};

// Classification wants a quick verdict; writing and the maximum level think
// as the model sees fit.
const effortByRole = {
  classification: "low",
  writing: "medium",
  maximum: "high",
} as const;

function toUsage(model: string, usage: Anthropic.Usage): AiUsage {
  return {
    model,
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
  };
}

function toParams(request: AiTextRequest) {
  return {
    model: models[request.role],
    max_tokens: request.maxTokens,
    system: request.system,
    messages: request.messages,
    output_config: { effort: effortByRole[request.role] },
  };
}

/**
 * The default package, paid with StoryToRole's key for credit-funded users or
 * with the user's own key when they bring one.
 */
export function createAnthropicPackage({
  apiKey,
}: {
  apiKey: string;
}): ProviderPackage {
  const client = new Anthropic({ apiKey });

  return {
    provider: "anthropic",
    models,

    async generateText(request) {
      const response = await client.messages.create(toParams(request));
      const text = response.content
        .flatMap((block) => (block.type === "text" ? [block.text] : []))
        .join("");

      return { text, usage: toUsage(response.model, response.usage) };
    },

    async generateObject(request) {
      const params = toParams(request);
      const response = await client.messages.parse({
        ...params,
        output_config: {
          ...params.output_config,
          format: zodOutputFormat(request.schema),
        },
      });

      return {
        object: response.parsed_output ?? null,
        usage: toUsage(response.model, response.usage),
      };
    },
  };
}
