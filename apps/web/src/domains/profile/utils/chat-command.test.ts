import { describe, expect, it } from "vitest";

import {
  decideClearKey,
  initialCommandMenu,
  isClearCommand,
  matchingCommands,
  reduceCommandMenu,
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

describe("command menu", () => {
  const list = ["/clear", "/limpar"];
  const start = initialCommandMenu;

  it("wraps the highlight with the arrows", () => {
    const down = reduceCommandMenu(start, "ArrowDown", list);
    expect(down.state.index).toBe(1);
    expect(reduceCommandMenu(down.state, "ArrowDown", list).state.index).toBe(
      0
    );
    expect(reduceCommandMenu(start, "ArrowUp", list).state.index).toBe(1);
    expect(down.handled).toBe(true);
  });

  it("Enter picks the highlighted command and runs it", () => {
    const down = reduceCommandMenu(start, "ArrowDown", list).state;
    const result = reduceCommandMenu(down, "Enter", list);
    expect(result.pick).toEqual({ command: "/limpar", run: true });
    expect(result.handled).toBe(true);
  });

  it("Tab picks without running", () => {
    expect(reduceCommandMenu(start, "Tab", list).pick).toEqual({
      command: "/clear",
      run: false,
    });
  });

  it("Escape closes the menu and then ignores keys", () => {
    const closed = reduceCommandMenu(start, "Escape", list).state;
    expect(closed.closed).toBe(true);
    expect(reduceCommandMenu(closed, "Enter", list).handled).toBe(false);
  });

  it("ignores keys when nothing matches", () => {
    expect(reduceCommandMenu(start, "Enter", []).handled).toBe(false);
    expect(reduceCommandMenu(start, "a", list).handled).toBe(false);
  });

  it("filters by the typed prefix", () => {
    expect(matchingCommands("/li")).toEqual(["/limpar"]);
    expect(matchingCommands("/x")).toEqual([]);
    expect(matchingCommands("clear")).toEqual([]);
  });
});
