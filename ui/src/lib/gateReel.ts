// gateReel — the "how your crew got here" reel, derived from the run's REAL executed steps.
//
// The reel is a Reality-doctrine surface: every chip must trace to a node that actually ran on this run,
// never a narrated fiction. So this reads the run's executionOrder, keeps only the steps that produced
// concrete work, and renders each as a plain past-tense line attributed to the teammate that ran it —
// the persona ROLE (via agentPersona), never the kebab agent ref. The verb comes from the teammate's
// function family and the object from the kind of item it staged, so "Prospect Researcher · found 12
// prospects" is true by construction. A step that produced nothing is setup/plumbing and is dropped, so
// the reel reads as the concrete things the crew did — not a trace log.

import type { GTMRunResult, GTMItem, ReelStep } from "@/types";
import { agentPersona, type AgentFamily } from "@/lib/agentPersona";

// Past-tense verb by the teammate's function family — plain words, no invention.
const FAMILY_VERB: Record<AgentFamily, string> = {
  research: "found",
  write: "drafted",
  qualify: "ranked",
  growth: "set up",
  content: "wrote",
  community: "reached",
  general: "produced",
};

// A friendly plural noun for what a step produced, from the item type it staged. "pieces"/"notes" avoid
// the awkward "wrote 2 drafts"; unknown shapes fall back to the honest generic.
function objectNoun(items: GTMItem[], count: number): string {
  const type = items.find((i) => typeof i.type === "string")?.type;
  switch (type) {
    case "prospect": return "prospects";
    case "contact": return "contacts";
    case "signal": return "signals";
    case "draft": return count === 1 ? "piece" : "pieces";
    case "context": return count === 1 ? "note" : "notes";
    default: return count === 1 ? "result" : "results";
  }
}

// Categories that are plumbing, not crew work — never a reel chip.
const SKIP_CATEGORIES = new Set(["context", "gate", "execute", "measure", "output"]);

export function gateReel(run: GTMRunResult | null | undefined): ReelStep[] {
  if (!run || !Array.isArray(run.executionOrder)) return [];
  const steps: ReelStep[] = [];
  for (const nodeId of run.executionOrder) {
    const node = run.nodes?.[nodeId];
    if (!node || !node.ok) continue;
    if (node.category && SKIP_CATEGORIES.has(node.category)) continue;
    if (!node.connector) continue;                        // no teammate ran it → not a crew step
    const count = Array.isArray(node.items) ? node.items.length : 0;
    if (count < 1) continue;                              // produced nothing concrete → plumbing, skip
    const persona = agentPersona(node.connector);
    steps.push({
      teammate: persona.role,
      verb: FAMILY_VERB[persona.family] ?? FAMILY_VERB.general,
      object: objectNoun(node.items, count),
      count,
    });
  }
  return steps;
}
