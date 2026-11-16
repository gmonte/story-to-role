import { readFileSync } from "node:fs";
import path from "node:path";

import {
  type MessageFormatElement,
  parse,
  TYPE,
} from "@formatjs/icu-messageformat-parser";
import { describe, expect, it } from "vitest";

const dir = path.join(import.meta.dirname, "..");
const read = (file: string) =>
  JSON.parse(readFileSync(path.join(dir, file), "utf8")) as Record<
    string,
    unknown
  >;

/** The arguments a message uses (not plural branch text): kept by its translation. */
function placeholders(text: string) {
  const names = new Set<string>();
  const walk = (elements: MessageFormatElement[]) => {
    for (const element of elements) {
      if (element.type === TYPE.literal || element.type === TYPE.pound) {
        continue;
      }
      names.add(element.value);
      if (element.type === TYPE.plural || element.type === TYPE.select) {
        for (const option of Object.values(element.options)) walk(option.value);
      }
      if (element.type === TYPE.tag) walk(element.children);
    }
  };
  walk(parse(text));
  return [...names].sort();
}

describe("pt-BR translations", () => {
  // Built by `intl:extract` from the code (postinstall runs it).
  const english = read("extracted/en-US.json") as Record<
    string,
    { translation: string }
  >;
  const portuguese = read("translations/pt-BR.json") as Record<string, string>;

  it("translate every message in the interface", () => {
    const missing = Object.entries(english)
      .filter(([id]) => typeof portuguese[id] !== "string")
      .map(([id, message]) => `${id}: ${message.translation}`);
    expect(missing).toEqual([]);
  });

  it("keep each message's placeholders", () => {
    const broken = Object.entries(english)
      .filter(([id]) => typeof portuguese[id] === "string")
      .filter(
        ([id, message]) =>
          placeholders(message.translation).join() !==
          placeholders(portuguese[id]).join()
      )
      .map(([id]) => id);
    expect(broken).toEqual([]);
  });

  it("use typographic quotes, never straight double quotes", () => {
    const straight = Object.entries(portuguese)
      .filter(([, text]) => text.includes('"'))
      .map(([id]) => id);
    expect(straight).toEqual([]);
  });
});
