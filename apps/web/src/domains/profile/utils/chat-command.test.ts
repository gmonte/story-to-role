import { describe, expect, it } from "vitest";

import { isClearCommand, matchingCommands } from "./chat-command";

describe("chat commands", () => {
  it("detects /clear and /limpar as the whole message", () => {
    expect(isClearCommand("/clear")).toBe(true);
    expect(isClearCommand("  /CLEAR \n")).toBe(true);
    expect(isClearCommand("/Limpar")).toBe(true);
    expect(isClearCommand("/clear now")).toBe(false);
    expect(isClearCommand("please /clear")).toBe(false);
    expect(isClearCommand("clear")).toBe(false);
  });

  it("lists the commands a slash prefix leads to", () => {
    expect(matchingCommands("/")).toEqual(["/clear", "/limpar"]);
    expect(matchingCommands("/cl")).toEqual(["/clear"]);
    expect(matchingCommands("/x")).toEqual([]);
    expect(matchingCommands("hello")).toEqual([]);
  });
});
