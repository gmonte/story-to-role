import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import {
  ToolRefusal,
  type AiRole,
  type AiTextRequest,
  type AiTool,
  type AiUsage,
  type ProviderPackage,
} from "./provider-package";

const models: Record<AiRole, string> = {
  classification: "claude-haiku-5-5",
  writing: "claude-sonnet-5-5",
  maximum: "claude-opus-5-5",
};

// How many times a paused server-side search turn is sent back.
const maxSearchResumes = 3;

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

function toAnthropicTool(tool: AiTool): Anthropic.Tool {
  const { $schema: _ignored, ...inputSchema } = z.toJSONSchema(tool.schema) as {
    $schema?: string;
  } & Anthropic.Tool.InputSchema;
  return {
    name: tool.name,
    description: tool.description,
    input_schema: inputSchema,
  };
}

async function runTool(
  tool: AiTool | undefined,
  input: unknown
): Promise<{ content: string; isError: boolean }> {
  if (!tool) return { content: "Unknown tool.", isError: true };

  const parsed = tool.schema.safeParse(input);
  if (!parsed.success) {
    return {
      content: `Invalid input: ${z.prettifyError(parsed.error)}`,
      isError: true,
    };
  }
  try {
    return { content: await tool.handler(parsed.data), isError: false };
  } catch (error) {
    if (error instanceof ToolRefusal) {
      return { content: error.message, isError: true };
    }
    throw error;
  }
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

    async runAgent(request) {
      const tools = request.tools.map(toAnthropicTool);
      const messages: Anthropic.MessageParam[] = [...request.messages];
      const usages: AiUsage[] = [];

      for (let iteration = 0; iteration < request.maxIterations; iteration++) {
        const response = await client.messages.create({
          ...toParams(request),
          messages,
          tools,
        });
        usages.push(toUsage(response.model, response.usage));

        const toolUses = response.content.filter(
          (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
        );
        if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
          const text = response.content
            .flatMap((block) => (block.type === "text" ? [block.text] : []))
            .join("");
          return { text, usages };
        }

        // The whole assistant turn goes back unchanged (thinking included).
        messages.push({ role: "assistant", content: response.content });
        const results: Anthropic.ToolResultBlockParam[] = [];
        for (const toolUse of toolUses) {
          const result = await runTool(
            request.tools.find((tool) => tool.name === toolUse.name),
            toolUse.input
          );
          results.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: result.content,
            is_error: result.isError,
          });
        }
        messages.push({ role: "user", content: results });
      }

      throw new Error("The agent did not finish within its iteration limit");
    },

    async searchWeb(request) {
      const messages: Anthropic.MessageParam[] = [...request.messages];
      const usages: AiUsage[] = [];
      const sources = new Map<string, string>();
      // A long server-side search pauses; sending the turn back resumes it.
      for (let resume = 0; resume <= maxSearchResumes; resume++) {
        const response = await client.messages.create({
          ...toParams(request),
          messages,
          tools: [
            {
              type: "web_search_20260209",
              name: "web_search",
              max_uses: request.maxSearches,
            },
          ],
        });
        usages.push(toUsage(response.model, response.usage));
        for (const block of response.content) {
          if (
            block.type === "web_search_tool_result" &&
            Array.isArray(block.content)
          ) {
            block.content.forEach((result) =>
              sources.set(result.url, result.title)
            );
          }
          if (block.type === "text") {
            for (const citation of block.citations ?? []) {
              if (citation.type === "web_search_result_location") {
                sources.set(citation.url, citation.title ?? citation.url);
              }
            }
          }
        }
        if (response.stop_reason !== "pause_turn") {
          const text = response.content
            .flatMap((block) => (block.type === "text" ? [block.text] : []))
            .join("");
          return {
            text,
            sources: [...sources].map(([url, title]) => ({ url, title })),
            usages,
          };
        }
        messages.push({ role: "assistant", content: response.content });
      }
      throw new Error("The web search did not finish within its resumes");
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
