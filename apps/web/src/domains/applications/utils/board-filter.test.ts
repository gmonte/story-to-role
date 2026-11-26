import { describe, expect, it } from "vitest";

import {
  boardChips,
  boardQueryToParams,
  defaultBoardFilter,
  isDefaultBoardFilter,
  isDefaultChip,
  parseBoardQuery,
  withChip,
} from "./board-filter";

const parse = (query: string) => parseBoardQuery(new URLSearchParams(query));

describe("parseBoardQuery", () => {
  it("opens with State is open", () => {
    expect(parse("")).toEqual({ filter: defaultBoardFilter, sort: "activity" });
    expect(parse("view=kanban&sort=status")).toEqual({
      filter: defaultBoardFilter,
      sort: "status",
    });
  });

  it("reads every chip removed as no filter at all", () => {
    expect(parse("filter=none").filter).toEqual({});
  });

  it("reads values and negations, dropping unknown ones", () => {
    expect(
      parse(
        "status=applied,in_process,bogus&fit_not=low&company=Acme, Inc&company=Globex&q=eng"
      ).filter
    ).toEqual({
      status: ["applied", "in_process"],
      fitNot: ["low"],
      company: ["Acme, Inc", "Globex"],
      q: "eng",
    });
  });
});

describe("boardQueryToParams", () => {
  it("writes nothing for the default", () => {
    expect(boardQueryToParams(defaultBoardFilter, "activity").toString()).toBe(
      ""
    );
  });

  it("round-trips a filter", () => {
    const filter = {
      status: ["analyzed" as const],
      stateNot: ["closed" as const],
      company: ["Acme, Inc"],
      q: "eng",
    };
    const params = boardQueryToParams(filter, "company");
    expect(parseBoardQuery(params)).toEqual({ filter, sort: "company" });
  });

  it("marks no filter at all", () => {
    expect(boardQueryToParams({}, "activity").toString()).toBe("filter=none");
  });
});

describe("chips", () => {
  it("lists the filter as chips and tells the default one apart", () => {
    const chips = boardChips({ state: ["open"], fitNot: ["low"] });
    expect(chips).toEqual([
      { field: "state", negated: false, values: ["open"] },
      { field: "fit", negated: true, values: ["low"] },
    ]);
    expect(chips.map(isDefaultChip)).toEqual([true, false]);
  });

  it("sets and removes a chip", () => {
    const chip = { field: "fit" as const, negated: true, values: ["low"] };
    const set = withChip(defaultBoardFilter, chip);
    expect(set).toEqual({ state: ["open"], fitNot: ["low"] });
    expect(isDefaultBoardFilter(set)).toBe(false);
    expect(withChip(set, chip, [])).toEqual(defaultBoardFilter);
    expect(isDefaultBoardFilter(withChip(set, chip, []))).toBe(true);
  });
});
