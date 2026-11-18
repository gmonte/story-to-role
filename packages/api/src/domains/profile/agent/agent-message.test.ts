import { describe, expect, it } from "vitest";

import { composeAgentMessage, splitAgentMessage } from "./agent-message";

describe("agent message", () => {
  it("round-trips a quote, its part, an attachment and the words", () => {
    const message = composeAgentMessage(
      "Linha um\nLinha dois",
      "Como resolvo?",
      "experience:beta",
      { kind: "review", text: "Falta o resultado.\nDiga quanto." }
    );
    expect(splitAgentMessage(message)).toEqual({
      quote: "Linha um\nLinha dois",
      part: "experience:beta",
      attachment: { kind: "review", text: "Falta o resultado.\nDiga quanto." },
      text: "Como resolvo?",
    });
  });

  it("carries an attachment alone, with no words and no quote", () => {
    const message = composeAgentMessage(null, "", null, {
      kind: "finding",
      text: "Sem verbo.",
    });
    expect(splitAgentMessage(message)).toEqual({
      quote: null,
      part: null,
      attachment: { kind: "finding", text: "Sem verbo." },
      text: "",
    });
  });

  it("leaves a plain message alone", () => {
    expect(composeAgentMessage(null, " oi ")).toBe("oi");
    expect(splitAgentMessage("~ não é anexo").attachment).toBeNull();
  });
});
