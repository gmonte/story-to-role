import { describe, expect, it } from "vitest";

import { sidebarGroup } from "./sidebar-group";

describe("sidebarGroup", () => {
  it("places an opening without an application by its own status", () => {
    expect(sidebarGroup({ status: "analyzed", applicationStatus: null })).toBe(
      "analyzed"
    );
  });

  it("places an opening with an application by the tracker's status", () => {
    expect(
      sidebarGroup({ status: "analyzed", applicationStatus: "in_preparation" })
    ).toBe("in_preparation");
    expect(
      sidebarGroup({ status: "analyzed", applicationStatus: "offer" })
    ).toBe("in_process");
    expect(
      sidebarGroup({ status: "analyzed", applicationStatus: "withdrawn" })
    ).toBe("closed");
  });

  it("places a closed opening under Closed, whatever its application", () => {
    expect(
      sidebarGroup({ status: "closed", applicationStatus: "in_preparation" })
    ).toBe("closed");
  });
});
