import type { AgentAttachment } from "@repo/api/domains/agents/agent-message";

export type ReviewerFeedbackSection =
  "contradiction" | "advice" | "partial" | "not_shown" | "review";

/**
 * One piece of a reviewer's feedback (or all of it) as the attachment the
 * person sends to the document agent: it reads the same in the chat card
 * and in the agent's message. A contradiction carries the resume passage
 * and the profile line it contradicts.
 */
export function reviewerAttachment(input: {
  section: ReviewerFeedbackSection;
  reviewer: number;
  rating: number;
  text: string;
  quote?: string | null;
  profileLine?: string | null;
}): AgentAttachment {
  const lines = [
    `Reviewer ${input.reviewer} (${input.rating}/10) said (${input.section.replace("_", " ")}): ${input.text}`,
  ];
  if (input.quote) lines.push(`Resume passage: “${input.quote}”`);
  if (input.profileLine) lines.push(`Profile line: “${input.profileLine}”`);
  return { kind: "reviewer", text: lines.join("\n") };
}
