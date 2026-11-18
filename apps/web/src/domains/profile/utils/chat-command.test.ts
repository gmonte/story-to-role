import { describe, expect, it } from "vitest";

import {
  decideClearKey,
  isClearCommand,
  matchingCommands,
} from "./chat-command";

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

describe("clear command confirmation", () => {
  it("sends on the first Enter, confirms on the second", () => {
    expect(decideClearKey(false, "Enter", false)).toBe("send");
    expect(decideClearKey(true, "Enter", false)).toBe("confirm");
  });

  it("cancels on any other key, so the key is typed", () => {
    expect(decideClearKey(true, "a", false)).toBe("cancel");
    expect(decideClearKey(true, "Backspace", false)).toBe("cancel");
    expect(decideClearKey(true, "Enter", true)).toBe("cancel");
  });

  it("does not cancel on a modifier alone", () => {
    for (const key of ["Shift", "Control", "Meta", "Alt"]) {
      expect(decideClearKey(true, key, false)).toBe("ignore");
    }
  });

  it("ignores keys when nothing is armed", () => {
    expect(decideClearKey(false, "a", false)).toBe("ignore");
  });
});
