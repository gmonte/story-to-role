const partLine = /^\[part: (.+)\]$/;

/**
 * A message about a passage carries the passage as leading quote lines
 * ("> …"), so the transcript, the agent and the chat all read the same
 * thing (profile spec, "Talking about a passage"). Its first quote line may
 * name the part of the profile the passage is in ("> [part: key]"): the
 * same line can exist in several experiences.
 */
export function composeAgentMessage(
  quote: string | null,
  text: string,
  part?: string | null
) {
  const lines = (quote ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return text.trim();
  const quoted = [...(part ? [`[part: ${part}]`] : []), ...lines]
    .map((line) => `> ${line}`)
    .join("\n");
  return `${quoted}\n\n${text.trim()}`;
}

export function splitAgentMessage(message: string): {
  quote: string | null;
  part: string | null;
  text: string;
} {
  const lines = message.split("\n");
  const quote: string[] = [];
  while (lines[0]?.startsWith(">")) {
    quote.push(lines.shift()!.replace(/^>\s?/, ""));
  }
  const part = partLine.exec(quote[0] ?? "")?.[1] ?? null;
  if (part) quote.shift();
  return {
    quote: quote.length ? quote.join("\n") : null,
    part,
    text: lines.join("\n").trim(),
  };
}
