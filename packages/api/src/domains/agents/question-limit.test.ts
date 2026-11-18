import { describe, expect, it } from "vitest";

import { limitQuestions } from "./question-limit";

async function through(deltas: string[], max = 3) {
  const stream = new ReadableStream({
    start(controller) {
      for (const text of deltas) {
        controller.enqueue({ type: "text-delta", id: "t", text });
      }
      controller.enqueue({ type: "tool-call", toolName: "read_part" });
      controller.close();
    },
  }).pipeThrough(
    limitQuestions(max)({ tools: {}, stopStream: () => undefined })
  );
  const out: Array<{ type: string; text?: string }> = [];
  for await (const chunk of stream as unknown as AsyncIterable<{
    type: string;
    text?: string;
  }>) {
    out.push(chunk);
  }
  return out;
}

describe("the three-question limit", () => {
  it("cuts the reply after its third question, across chunks", async () => {
    const out = await through([
      "Entendi. Qual era o time? E o produ",
      "to? De onde vem o número?! E mais",
      " uma coisa: o que você não fez?",
    ]);
    expect(
      out
        .filter((chunk) => chunk.type === "text-delta")
        .map((chunk) => chunk.text)
        .join("")
    ).toBe("Entendi. Qual era o time? E o produto? De onde vem o número?!");
    // Tool calls still pass after the cut.
    expect(out.at(-1)?.type).toBe("tool-call");
  });

  it("leaves a reply with fewer questions untouched", async () => {
    const out = await through(["Anotado. Qual foi o resultado? Sem pressa."]);
    expect(out[0].text).toBe("Anotado. Qual foi o resultado? Sem pressa.");
  });
});
