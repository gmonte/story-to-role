/**
 * A message about a passage carries the passage as leading quote lines
 * ("> …"), so the transcript, the agent and the chat all read the same
 * thing (profile spec, "Talking about a passage").
 */
export function composeAgentMessage(quote: string | null, text: string) {
  const quoted = (quote ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `> ${line}`)
    .join("\n");
  return quoted ? `${quoted}\n\n${text.trim()}` : text.trim();
}

export function splitAgentMessage(message: string): {
  quote: string | null;
  text: string;
} {
  const lines = message.split("\n");
  const quote: string[] = [];
  while (lines[0]?.startsWith(">")) {
    quote.push(lines.shift()!.replace(/^>\s?/, ""));
  }
  return {
    quote: quote.length ? quote.join("\n") : null,
    text: lines.join("\n").trim(),
  };
}
