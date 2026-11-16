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

/** Whether every plural in the message has its own `=0` branch. */
function pluralsHandleZero(text: string) {
  const walk = (elements: MessageFormatElement[]): boolean =>
    elements.every((element) => {
      if (element.type === TYPE.plural && !("=0" in element.options)) {
        return false;
      }
      if (element.type === TYPE.plural || element.type === TYPE.select) {
        return Object.values(element.options).every((option) =>
          walk(option.value)
        );
      }
      return element.type === TYPE.tag ? walk(element.children) : true;
    });
  return walk(parse(text));
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

  // Portuguese's `one` category covers zero: without `=0`, 0 reads "0 fato".
  it("give every plural a zero case", () => {
    const singularZero = Object.entries(portuguese)
      .filter(([, text]) => !pluralsHandleZero(text))
      .map(([id]) => id);
    expect(singularZero).toEqual([]);
  });

  it("use typographic quotes, never straight double quotes", () => {
    const straight = Object.entries(portuguese)
      .filter(([, text]) => text.includes('"'))
      .map(([id]) => id);
    expect(straight).toEqual([]);
  });
});
