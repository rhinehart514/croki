import { readFileSync } from "node:fs";
import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ATLAS_MOTION, trackAtlasArrivals } from "./atlasMotion";
import type { AtlasNode } from "./atlasTypes";
import { useAtlasArrivalTracker } from "./useAtlasArrivalTracker";

function node(id: string, kind: AtlasNode["data"]["kind"], theoryRevision?: number) {
  return { id, position: { x: 0, y: 0 }, data: { kind, theoryRevision } } as AtlasNode;
}

describe("atlas motion contract", () => {
  it("keeps every Atlas duration inside the settled 180–280ms range", () => {
    expect(Object.values(ATLAS_MOTION).every((duration) => duration >= 0.18 && duration <= 0.28)).toBe(true);
  });

  it("arrives only newly observed durable theory, work, and outcome receipts", () => {
    const initial = trackAtlasArrivals(null, [
      node("theory:buyer", "theory", 1),
      node("work:rewrite", "work"),
      node("bet:one", "bet"),
    ]);
    expect(initial.arrivals.size).toBe(0);

    const next = trackAtlasArrivals(initial.known, [
      node("theory:buyer", "theory", 2),
      node("work:rewrite", "work"),
      node("outcome:return-1", "outcome"),
      node("bet:two", "bet"),
    ]);
    expect([...next.arrivals.entries()]).toEqual([
      ["theory:buyer", "theory:buyer:revision:2"],
      ["outcome:return-1", "outcome:return-1"],
    ]);
    expect(trackAtlasArrivals(next.known, [node("theory:buyer", "theory", 2), node("outcome:return-1", "outcome")]).arrivals.size).toBe(0);
  });

  it("settles first-load records and marks later durable receipts exactly once", () => {
    const { result, rerender } = renderHook(
      ({ projectionPresent }) => useAtlasArrivalTracker("venture-1", projectionPresent),
      { initialProps: { projectionPresent: false } },
    );
    expect(result.current([node("work:existing", "work")])[0]?.data.arrivalReceiptId).toBeUndefined();

    rerender({ projectionPresent: true });
    expect(result.current([node("work:existing", "work"), node("theory:buyer", "theory", 1)]).every((item) => !item.data.arrivalReceiptId)).toBe(true);

    const arrived = result.current([node("work:existing", "work"), node("theory:buyer", "theory", 2), node("outcome:return-1", "outcome")]);
    expect(arrived.map((item) => item.data.arrivalReceiptId)).toEqual([undefined, "theory:buyer:revision:2", "outcome:return-1"]);
    expect(result.current(arrived).every((item) => !item.data.arrivalReceiptId)).toBe(true);
  });

  it("forbids scene, keyboard, fake-progress, and held-decision ceremony", () => {
    const element = readFileSync("src/components/atlas/ArchitectureElement.tsx", "utf8");
    const bet = readFileSync("src/components/atlas/AtlasBetNode.tsx", "utf8");
    const camera = readFileSync("src/components/atlas/useAtlasCamera.ts", "utf8");
    const firmCss = readFileSync("src/styles/firm-app.css", "utf8");
    const diveCss = readFileSync("src/styles/atlas-dive.css", "utf8");
    const proposalCss = readFileSync("src/components/atlas/propose/architecture-proposal.css", "utf8");

    expect(element).not.toContain('layout="position"');
    expect(bet).not.toMatch(/height:\s*["']auto["']/);
    expect(camera).not.toMatch(/duration:\s*(?!0\b)\d+/);
    expect(firmCss).not.toMatch(/firm-app-(command-travel|scope-arrive)/);
    expect(diveCss).not.toMatch(/\.atlas-dive-node-gate:hover[^}]*transform/);
    expect(proposalCss).not.toContain("animation-delay");
  });
});
