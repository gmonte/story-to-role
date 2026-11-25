import type { MouseEvent } from "react";

import { afterEach, describe, expect, it, vi } from "vitest";

import { onCardClick } from "./card-click";

/** A card with some text and an Ignore button, as the findings lists draw. */
function card() {
  document.body.innerHTML = `
    <li id="card">
      <p id="text">Bring the PostgreSQL line forward.</p>
      <div><button id="ignore"><svg id="icon"></svg>Ignore</button></div>
      <a id="link" href="/app/career">Open</a>
    </li>`;
  const byId = (id: string) => document.getElementById(id)!;
  const click = (id: string, open: () => void) =>
    onCardClick(open)({ target: byId(id) } as unknown as MouseEvent);
  return { click };
}

describe("onCardClick", () => {
  afterEach(() => {
    window.getSelection()?.removeAllRanges();
  });

  it("opens the card's target on a click anywhere on the card", () => {
    const open = vi.fn();
    card().click("card", open);
    card().click("text", open);
    expect(open).toHaveBeenCalledTimes(2);
  });

  it("leaves a click on the card's own buttons and links to them", () => {
    const open = vi.fn();
    const { click } = card();
    click("ignore", open);
    click("icon", open);
    click("link", open);
    expect(open).not.toHaveBeenCalled();
  });

  it("doesn't open while the user is selecting the card's text", () => {
    const open = vi.fn();
    const { click } = card();
    const range = document.createRange();
    range.selectNodeContents(document.getElementById("text")!);
    window.getSelection()!.addRange(range);
    click("text", open);
    expect(open).not.toHaveBeenCalled();
  });
});
