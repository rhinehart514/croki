import { describe, expect, it } from "vitest";
import { channelIdForGraph } from "./channelIdentity";
import type { ChannelMeta } from "@/types";

const channels = [{
  id: "warm-conversion",
  graphId: "acme-saas--warm-conversion",
  name: "Warm conversion",
}] as ChannelMeta[];

describe("channelIdForGraph", () => {
  it("maps a project-scoped graph id to its founder-facing pipeline id", () => {
    expect(channelIdForGraph(channels, "acme-saas--warm-conversion")).toBe("warm-conversion");
  });

  it("keeps legacy same-id pipelines navigable", () => {
    expect(channelIdForGraph(channels, "warm-conversion")).toBe("warm-conversion");
  });
});
