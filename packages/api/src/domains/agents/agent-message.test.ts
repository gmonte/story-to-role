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
      version: null,
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
      version: null,
    });
  });

  it("carries the document version the message was written on", () => {
    const version = "1b4e28ba-2fa1-11d2-883f-0016d3cca427";
    const withQuote = composeAgentMessage(
      "Linha um",
      "E isso?",
      null,
      null,
      version
    );
    expect(splitAgentMessage(withQuote)).toMatchObject({
      quote: "Linha um",
      text: "E isso?",
      version,
    });
    const alone = composeAgentMessage(null, "Oi", null, null, version);
    expect(splitAgentMessage(alone)).toMatchObject({
      quote: null,
      text: "Oi",
      version,
    });
  });

  it("leaves a plain message alone", () => {
    expect(composeAgentMessage(null, " oi ")).toBe("oi");
    expect(splitAgentMessage("~ não é anexo").attachment).toBeNull();
  });
});
