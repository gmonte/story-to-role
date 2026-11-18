const partLine = /^\[part: (.+)\]$/;
const attachmentHead = /^~ \[(finding|review)\] ?(.*)$/;

// The most of a finding's or review's text a message carries.
export const maxAttachmentCharacters = 600;

export type AgentAttachment = { kind: "finding" | "review"; text: string };

/**
 * A message about a passage carries the passage as leading quote lines
 * ("> …"), so the transcript, the agent and the chat all read the same
 * thing (profile spec, "Talking about a passage"). Its first quote line may
 * name the part of the profile the passage is in ("> [part: key]"): the
 * same line can exist in several experiences. A finding or review being
 * discussed follows the quote as lines starting "~ ", the first naming its
 * kind ("~ [finding] …"); the person's own words come after.
 */
export function composeAgentMessage(
  quote: string | null,
  text: string,
  part?: string | null,
  attachment?: AgentAttachment | null
) {
  const lines = (quote ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const attached = (attachment?.text ?? "")
    .slice(0, maxAttachmentCharacters)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length && !attached.length) return text.trim();
  const quoted = lines.length
    ? [...(part ? [`[part: ${part}]`] : []), ...lines]
        .map((line) => `> ${line}`)
        .join("\n")
    : "";
  const about =
    attachment && attached.length
      ? [`~ [${attachment.kind}] ${attached[0]}`, ...attached.slice(1)]
          .map((line, index) => (index ? `~ ${line}` : line))
          .join("\n")
      : "";
  return `${[quoted, about].filter(Boolean).join("\n")}\n\n${text.trim()}`;
}

export function splitAgentMessage(message: string): {
  quote: string | null;
  part: string | null;
  attachment: AgentAttachment | null;
  text: string;
} {
  const lines = message.split("\n");
  const quote: string[] = [];
  while (lines[0]?.startsWith(">")) {
    quote.push(lines.shift()!.replace(/^>\s?/, ""));
  }
  const part = partLine.exec(quote[0] ?? "")?.[1] ?? null;
  if (part) quote.shift();
  let attachment: AgentAttachment | null = null;
  const head = attachmentHead.exec(lines[0] ?? "");
  if (head) {
    lines.shift();
    const body = [head[2]];
    while (lines[0]?.startsWith("~ ")) body.push(lines.shift()!.slice(2));
    attachment = {
      kind: head[1] as AgentAttachment["kind"],
      text: body.join("\n"),
    };
  }
  return {
    quote: quote.length ? quote.join("\n") : null,
    part,
    attachment,
    text: lines.join("\n").trim(),
  };
}
