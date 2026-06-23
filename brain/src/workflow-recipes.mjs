export function pilotOutreachRecipe({ id = "pilot-outreach", name = "Pilot outreach" } = {}) {
  return {
    id,
    name,
    version: "1.0",
    revision: 0,
    objective: "Research a small pilot market, draft evidence-based outreach, review it, stage approved messages, and measure attributable demand.",
    nodes: [
      {
        id: "input-metros",
        category: "source",
        connector: "manual",
        label: "Target metros",
        position: { x: 0, y: 0 },
        config: { items: [] },
        contract: { emits: ["metro"] },
      },
      {
        id: "research-prospects",
        category: "enrich",
        kind: "agent",
        ref: "gtm-pco-prospect-research-agent",
        label: "Research PCO prospects",
        position: { x: 312, y: 0 },
        config: {},
        contract: {
          accepts: ["metro"],
          emits: ["company", "decisionMaker", "personalFact", "nowTrigger"],
          minItems: 1,
        },
      },
      {
        id: "draft-outreach",
        category: "generate",
        kind: "agent",
        ref: "gtm-pco-outreach-draft-agent",
        label: "Draft personal outreach",
        position: { x: 624, y: 0 },
        config: {},
        contract: {
          accepts: ["company", "decisionMaker", "personalFact", "nowTrigger"],
          emits: ["draft", "subject"],
          minItems: 1,
        },
      },
      {
        id: "founder-review",
        category: "gate",
        connector: "default",
        label: "Founder review",
        position: { x: 936, y: 0 },
        config: {},
        contract: {
          accepts: ["draft"],
          emits: ["draft", "approved", "gtmActionId"],
          minItems: 1,
        },
      },
      {
        id: "stage-approved",
        category: "execute",
        connector: "local",
        label: "Stage approved messages",
        position: { x: 1248, y: 0 },
        config: { channel: "email" },
        contract: {
          accepts: ["draft", "approved", "gtmActionId"],
          emits: ["draft", "gtmActionId", "executionStatus"],
        },
      },
      {
        id: "measure-pilot",
        category: "measure",
        connector: "default",
        label: "Measure pilot requests",
        position: { x: 1560, y: 0 },
        config: { joinKey: "gtmActionId", winEvent: "pilot_requested" },
        contract: {
          accepts: ["gtmActionId", "source"],
          emits: ["attribution"],
        },
      },
    ],
    edges: [
      { id: "metro-research", source: "input-metros", target: "research-prospects", edgeType: "data" },
      { id: "research-draft", source: "research-prospects", target: "draft-outreach", edgeType: "data" },
      { id: "draft-review", source: "draft-outreach", target: "founder-review", edgeType: "data" },
      { id: "review-stage", source: "founder-review", target: "stage-approved", edgeType: "data" },
      { id: "stage-measure", source: "stage-approved", target: "measure-pilot", edgeType: "data" },
      { id: "measure-feedback", source: "measure-pilot", target: "research-prospects", edgeType: "feedback", label: "Learn from attributed outcomes" },
    ],
  };
}

