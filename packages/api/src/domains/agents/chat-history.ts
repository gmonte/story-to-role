import type { ModelMessage } from "ai";

/** The text of the conversation's last message from `role`. */
export function lastText(messages: ModelMessage[], role: "user" | "assistant") {
  const last = messages.findLast((message) => message.role === role);
  if (!last) return undefined;
  return typeof last.content === "string"
    ? last.content
    : last.content
        .flatMap((part) => (part.type === "text" ? [part.text] : []))
        .join("\n");
}

/**
 * The window may open on the chat's own words (a fixed reply, a cut
 * history); the provider wants a user message first, so one stands in.
 */
export function startingWithUser(messages: ModelMessage[]): ModelMessage[] {
  return messages[0]?.role === "user"
    ? messages
    : [{ role: "user", content: "(Earlier in this chat.)" }, ...messages];
}

/**
 * The history without the model's earlier reasoning: a thinking block is
 * bound to the exact conversation it was written in, and the agent's
 * prompt (the passage, the index) and window change from one turn to the next.
 */
export function withoutReasoning(messages: ModelMessage[]): ModelMessage[] {
  return messages.map((message) =>
    message.role === "assistant" && Array.isArray(message.content)
      ? {
          ...message,
          content: message.content.filter((part) => part.type !== "reasoning"),
        }
      : message
  );
}
