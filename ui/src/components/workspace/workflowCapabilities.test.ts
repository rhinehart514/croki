import { describe, expect, it } from "vitest";
import type { SystemIndexObject } from "@/api";
import type { FirmConfiguredAgent } from "@/types";
import {
  relevantWorkflowCapabilities,
  workflowCapabilities,
  type RuntimeCapabilityInventoryItem,
  type WorkflowCapability,
} from "./workflowCapabilities";

const gmailCredential = {
  provider: "gmail",
  label: "Gmail",
  savedAt: "now",
  hasToken: true,
  authType: "oauth" as const,
  accountAddress: "founder@example.com",
};

const agent = {
  ref: "agent:one",
  name: "One",
  label: null,
  perspective: null,
  activation: "direct",
  capabilities: { firmTools: true, additional: ["crm.lookup"] },
  context: { scope: "venture", instructions: null },
  memory: { scope: "venture", instructions: null },
  runtime: { provider: null, model: null },
  budget: { maxSteps: null, dailySpendUsd: null },
  authority: { outwardEffects: "wall" },
  evaluation: { signals: [], instructions: null },
} satisfies FirmConfiguredAgent;

function inventoryItem(overrides: Partial<RuntimeCapabilityInventoryItem> & Pick<RuntimeCapabilityInventoryItem, "id" | "label" | "provider">): RuntimeCapabilityInventoryItem {
  return {
    kind: "tool",
    authority: "read",
    status: "available",
    detail: "Reported by the host",
    ...overrides,
  };
}

function focus(overrides: Partial<SystemIndexObject> = {}): SystemIndexObject {
  return {
    id: "focus",
    objectRef: "object:focus",
    name: "Research market evidence",
    statement: "Search the web for attributable competitor evidence.",
    type: "workflow",
    territory: "gtm",
    assertion: "founder-asserted",
    provenance: null,
    properties: {},
    compatibilityOwned: false,
    architectureRole: null,
    threadRefs: [],
    attention: [],
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

describe("workflowCapabilities", () => {
  it("separates Gmail observation from founder-gated sending without claiming Browser availability", () => {
    const result = workflowCapabilities([gmailCredential]);
    expect(result).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "gmail.read", kind: "source", authority: "read", status: "available" }),
      expect.objectContaining({ id: "gmail.send", kind: "action", authority: "founder-gate", status: "available" }),
    ]));
    expect(result.some((capability) => capability.id === "browser")).toBe(false);
  });

  it("does not turn a saved generic credential or configured agent label into callable access", () => {
    const result = workflowCapabilities(
      [{ provider: "exa", label: "Exa Search", savedAt: "now", hasToken: true, authType: "token" }],
      [agent],
    );
    expect(result.some((capability) => capability.provider === "exa")).toBe(false);
    expect(result).toContainEqual(expect.objectContaining({ id: "crm.lookup", status: "unavailable" }));
    expect(JSON.stringify(result)).not.toContain("token");
  });

  it("uses the host inventory as authority for Browser, Exa search, and Exa fetch", () => {
    const inventory = [
      inventoryItem({ id: "browser", label: "Browser", provider: "browser", status: "reconnect" }),
      inventoryItem({ id: "exa.search", label: "Exa Search", provider: "exa", kind: "source" }),
      inventoryItem({ id: "exa.fetch", label: "Exa Fetch", provider: "exa", kind: "source" }),
    ];
    const result = workflowCapabilities([gmailCredential], [agent], inventory);
    expect(result.map((capability) => capability.id)).toEqual(["browser", "exa.fetch", "exa.search"]);
    expect(result).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "browser", status: "reconnect" }),
      expect.objectContaining({ id: "exa.search", kind: "source", authority: "read" }),
      expect.objectContaining({ id: "exa.fetch", kind: "source", authority: "read" }),
    ]));
  });

  it("keeps the resting rail quiet and ranks tools against the selected Product / GTM object", () => {
    const capabilities: WorkflowCapability[] = [
      inventoryItem({ id: "repository", label: "Repository", provider: "native", kind: "workspace", authority: "inward", relevance: { atRest: true, territories: ["product"] } }),
      inventoryItem({ id: "browser", label: "Browser", provider: "browser" }),
      inventoryItem({ id: "exa.search", label: "Exa Search", provider: "exa", kind: "source" }),
      inventoryItem({ id: "gmail.read", label: "Gmail Read", provider: "gmail", kind: "source" }),
      inventoryItem({ id: "calendar.read", label: "Calendar", provider: "calendar", kind: "source" }),
    ];

    expect(relevantWorkflowCapabilities(capabilities, null).map((capability) => capability.id)).toEqual(["repository"]);
    expect(relevantWorkflowCapabilities(capabilities, focus()).map((capability) => capability.id)).toEqual([
      "exa.search",
      "browser",
      "repository",
    ]);
  });

  it("surfaces an exact unavailable capability when the selected object calls for it", () => {
    const capabilities: WorkflowCapability[] = [
      inventoryItem({ id: "crm.lookup", label: "CRM Lookup", provider: "crm", status: "unavailable", kind: "source", relevance: { terms: ["crm"] } }),
      inventoryItem({ id: "repository", label: "Repository", provider: "native", kind: "workspace", authority: "inward", relevance: { atRest: true } }),
    ];
    const selected = focus({ name: "Look up the CRM account", statement: "Use capability crm.lookup", properties: { capabilityRefs: ["crm.lookup"] } });
    expect(relevantWorkflowCapabilities(capabilities, selected)[0]).toEqual(expect.objectContaining({ id: "crm.lookup", status: "unavailable" }));
  });
});
