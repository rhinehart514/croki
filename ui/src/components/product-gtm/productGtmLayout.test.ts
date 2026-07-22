import { describe, expect, it } from "vitest";
import type { FirmSemanticModel } from "@/types";
import { productGtmBundleOffset } from "./productGtmEdgeGeometry";
import { buildProductGtmLayout, pageWalkOrder } from "./productGtmLayout";
import { layoutProductGtmWorkflow } from "./productGtmWorkflow";

const page = (id: string, route: string) => ({
  id, type: "page", name: id, statement: id, assertion: "tentative" as const,
  properties: { territory: "product", page: { route, file: `src/app${route === "/" ? "" : route}/page.tsx`, sourceRef: `repository:${id}#L1-L40:abcabcabcabc` } },
});
const pageLink = (from: string, to: string) => ({
  id: `page-link-${from}-${to}`, fromRef: `object:${from}`, toRef: `object:${to}`, label: "links to",
  type: "page-link", properties: { territory: "product" }, assertion: "tentative" as const,
  sourceRefs: [`repository:${from}#L1-L40:abcabcabcabc`],
});

const entry = (id: string, type: string) => ({
  id, type, name: id, statement: id, properties: {}, assertion: "founder-asserted" as const,
});
const provisional = (id: string, type: string) => ({
  id, type, name: id, statement: id, properties: {}, assertion: "tentative" as const,
});
const join = (from: string, to: string) => ({
  id: `${from}-${to}`, fromRef: `object:${from}`, toRef: `object:${to}`, label: "leads to",
  type: "connected", properties: {}, assertion: "founder-asserted" as const, sourceRefs: [],
});

describe("Product/GTM layout", () => {
  it("prefers a complete Product-to-market-to-evidence chapter over a longer generic chain", () => {
    const model: FirmSemanticModel = {
      schemaVersion: 3, ventureId: "venture-one", revision: 1,
      objects: [
        entry("direction", "direction"), entry("generic-a", "note"), entry("generic-b", "note"), entry("generic-c", "note"), entry("generic-d", "note"), entry("generic-e", "note"),
        entry("product", "capability"), entry("market", "campaign"), entry("evidence", "evidence"),
      ],
      relationships: [
        join("direction", "generic-a"), join("generic-a", "generic-b"), join("generic-b", "generic-c"), join("generic-c", "generic-d"), join("generic-d", "generic-e"),
        join("direction", "product"), join("product", "market"), join("market", "evidence"),
      ],
      modelBranches: [], modelChanges: [], modelMergeReceipts: [], workScopes: [], outwardActions: [],
    };

    const layout = buildProductGtmLayout(model, null, null);

    expect(layout.spine).toEqual(["direction", "product", "market", "evidence"]);
    expect([...layout.initialFocusIds]).toEqual(layout.spine);
  });

  it("lays an all-provisional read-back out as a left-to-right trunk, not one vertical column", () => {
    const model: FirmSemanticModel = {
      schemaVersion: 3, ventureId: "fresh-venture", revision: 1,
      objects: [
        provisional("read-what-it-does", "working-theory"),
        provisional("read-who-its-for", "working-theory"),
        provisional("read-uncertain", "working-theory"),
      ],
      relationships: [],
      modelBranches: [], modelChanges: [], modelMergeReceipts: [], workScopes: [], outwardActions: [],
    };

    const layout = buildProductGtmLayout(model, null, null);

    expect(layout.spine).toEqual(["read-what-it-does", "read-who-its-for", "read-uncertain"]);
    const xs = layout.spine.map((id) => layout.positions.get(id)!.x);
    expect(new Set(xs).size).toBe(3);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
  });

  it("follows relationships when a provisional read-back is already chained", () => {
    const model: FirmSemanticModel = {
      schemaVersion: 3, ventureId: "fresh-chained", revision: 1,
      objects: [
        provisional("what", "working-theory"), provisional("who", "working-theory"), provisional("uncertain", "working-theory"),
      ],
      relationships: [
        { id: "what-who", fromRef: "object:what", toRef: "object:who", label: "leads to", type: "connected", properties: {}, assertion: "tentative" as const, sourceRefs: [] },
        { id: "who-uncertain", fromRef: "object:who", toRef: "object:uncertain", label: "leads to", type: "connected", properties: {}, assertion: "tentative" as const, sourceRefs: [] },
      ],
      modelBranches: [], modelChanges: [], modelMergeReceipts: [], workScopes: [], outwardActions: [],
    };

    const layout = buildProductGtmLayout(model, null, null);

    expect(layout.spine).toEqual(["what", "who", "uncertain"]);
  });

  it("keeps workflow columns and branches compact enough for readable chapter framing", () => {
    const graph = {
      steps: [
        { id: "trigger", label: "Signal" }, { id: "prepare", label: "Prepare" },
        { id: "approve", label: "Approve" }, { id: "revise", label: "Revise" }, { id: "send", label: "Send" },
      ],
      edges: [
        { from: "trigger", to: "prepare" }, { from: "prepare", to: "approve" },
        { from: "prepare", to: "revise" }, { from: "approve", to: "send" }, { from: "revise", to: "send" },
      ],
    };
    const layout = layoutProductGtmWorkflow("owner", graph, { x: 100, y: 200 });

    expect(layout.positions.get("prepare")!.x - layout.positions.get("trigger")!.x).toBe(272);
    expect(Math.abs(layout.positions.get("approve")!.y - layout.positions.get("revise")!.y)).toBe(72);
  });

  it("lays a long play out at full length, one column per step with a fixed pitch", () => {
    // Full length, always: a 30-step linear play occupies 30 distinct columns at the fixed 272px pitch so the
    // founder scrolls the whole play. Nothing collapses the middle into a summary.
    const steps = Array.from({ length: 30 }, (_, index) => ({ id: `s${index}`, label: `Step ${index}` }));
    const edges = steps.slice(1).map((step, index) => ({ from: `s${index}`, to: step.id }));
    const layout = layoutProductGtmWorkflow("long", { steps, edges }, { x: 100, y: 200 });
    const xs = steps.map((step) => layout.positions.get(step.id)!.x);

    expect(new Set(xs).size).toBe(30);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    expect(xs[1] - xs[0]).toBe(272);
    expect(xs[29] - xs[0]).toBe(272 * 29);
  });

  it("fans bundled branches around their shared route", () => {
    expect([0, 1, 2].map((index) => productGtmBundleOffset(index, 3))).toEqual([-16, 0, 16]);
    expect(productGtmBundleOffset(0, 1)).toBe(0);
  });

  it("orders pages in walk order — entry left, the walk deepening rightward", () => {
    // The acme-saas shape: Landing links to Pricing and Signup; Pricing links to Signup; Settings has no
    // proven inbound link and sits as a deep interior page. The entry page leads.
    const model: FirmSemanticModel = {
      schemaVersion: 3, ventureId: "acme", revision: 1,
      objects: [page("settings", "/settings"), page("signup", "/signup"), page("pricing", "/pricing"), page("landing", "/")],
      relationships: [pageLink("landing", "pricing"), pageLink("landing", "signup"), pageLink("pricing", "signup")],
      modelBranches: [], modelChanges: [], modelMergeReceipts: [], workScopes: [], outwardActions: [],
    };

    const order = pageWalkOrder(model);
    const rank = (id: string) => order.indexOf(id);

    // Entry is leftmost; Signup sits past Pricing because its longest proven walk runs Landing -> Pricing ->
    // Signup; Settings, an orphan interior page, sits rightmost by route depth with no invented connection.
    expect(order[0]).toBe("landing");
    expect(rank("pricing")).toBeLessThan(rank("signup"));
    expect(order[order.length - 1]).toBe("settings");
  });

  it("keeps a return-home link from moving an entry page rightward", () => {
    // Settings links back to "/". That return-home navigation must not pull Landing to the right or make
    // Settings an entry seed; the walk still opens at Landing.
    const model: FirmSemanticModel = {
      schemaVersion: 3, ventureId: "acme", revision: 1,
      objects: [page("landing", "/"), page("settings", "/settings")],
      relationships: [pageLink("settings", "landing")],
      modelBranches: [], modelChanges: [], modelMergeReceipts: [], workScopes: [], outwardActions: [],
    };

    expect(pageWalkOrder(model)[0]).toBe("landing");
  });
});
