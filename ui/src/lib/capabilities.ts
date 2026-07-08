// Capabilities — what your crew can reach and do. This is the founder-facing roster that sits on the
// workspace rail beside Pipelines and Crew: the tools a pipeline is wired from. Each one carries a
// plain-English line (what it does, when you'd reach for it) in the same voice as the crew blurbs, a real
// brand mark where an open-licensed one exists (else a clean lettermark), the run-stage it belongs to,
// and whether it reaches the outside world — because anything that does routes through the founder gate.
//
// This is deliberately an OPEN list, not a closed enum: it names the capabilities worth surfacing today,
// but the model is "anything you connect shows up here." Do not turn it into a hard taxonomy the runtime
// depends on — that is the cage this product keeps deleting.

import { BRAND_MARKS, type BrandMark } from "./capabilityLogos";

export type CapStage = "find" | "enrich" | "reach" | "publish" | "measure";

export const STAGE_LABEL: Record<CapStage, string> = {
  find: "Find",
  enrich: "Enrich",
  reach: "Reach",
  publish: "Publish",
  measure: "Measure",
};

export const STAGE_ORDER: CapStage[] = ["find", "enrich", "reach", "publish", "measure"];

// A capability grabbed onto the canvas lands as a pipeline step of this category — its run-stage read as
// a graph stage, so a "reach" capability (Gmail) becomes a gated execute step and a "find" one (Exa)
// becomes a source. It lands collapsed and draggable like a teammate; the founder wires it or asks Claude.
export const CAP_STAGE_CATEGORY: Record<CapStage, "source" | "enrich" | "execute" | "measure"> = {
  find: "source",
  enrich: "enrich",
  reach: "execute",
  publish: "execute",
  measure: "measure",
};

export type Capability = {
  id: string;
  name: string;
  blurb: string;
  stage: CapStage;
  // A real open-licensed brand mark when one exists, otherwise a lettermark tile in the brand's tone.
  markId?: keyof typeof BRAND_MARKS;
  lettermark?: { text: string; hex: string };
  // Reaches the outside world (sends, publishes, books) → it can only act behind the founder gate.
  gated?: boolean;
};

export function capabilityMark(cap: Capability): BrandMark | null {
  return cap.markId ? BRAND_MARKS[cap.markId] : null;
}

// The starting roster. Ordered by run-stage so the rail reads as a pipeline: find → enrich → reach →
// publish → measure. Blurbs say what it does for you, never a product tagline.
export const CAPABILITIES: Capability[] = [
  // ── Find — surface the right people and orgs
  { id: "exa", name: "Exa", stage: "find", lettermark: { text: "Ex", hex: "#1B1B1F" },
    blurb: "Finds people and companies by meaning, not keywords — start a pipeline with the right names." },
  { id: "github", name: "GitHub", stage: "find", markId: "github",
    blurb: "Surfaces who's starring and forking your repos — warm inbound signal to act on." },
  { id: "reddit", name: "Reddit", stage: "find", markId: "reddit",
    blurb: "Listens where your buyers actually talk — pull it in to find real demand." },

  // ── Enrich — turn a name into a dossier and one true opener
  { id: "firecrawl", name: "Firecrawl", stage: "enrich", lettermark: { text: "Fc", hex: "#E8603C" },
    blurb: "Reads a prospect's own site into facts — so your outreach is grounded, not guessed." },
  { id: "perplexity", name: "Perplexity", stage: "enrich", markId: "perplexity",
    blurb: "Researches the live market — competitors, triggers, what's true right now." },

  // ── Reach — the gated outbound
  { id: "gmail", name: "Gmail", stage: "reach", markId: "gmail", gated: true,
    blurb: "Sends your drafts — always through your gate, never on its own." },
  { id: "linkedin", name: "LinkedIn", stage: "reach", lettermark: { text: "Li", hex: "#0A66C2" }, gated: true,
    blurb: "Reaches people where you already have a presence — messages and posts." },
  { id: "googlecalendar", name: "Calendar", stage: "reach", markId: "googlecalendar", gated: true,
    blurb: "Books the call once someone says yes." },

  // ── Publish — microproducts and artifacts
  { id: "vercel", name: "Vercel", stage: "publish", markId: "vercel", gated: true,
    blurb: "Ships a landing page or microproduct cut from your real product." },
  { id: "figma", name: "Figma", stage: "publish", markId: "figma",
    blurb: "Turns a result into a visual artifact worth sending." },
  { id: "notion", name: "Notion", stage: "publish", markId: "notion", gated: true,
    blurb: "Publishes a report your prospect can actually read." },

  // ── Measure — close the loop, feed taste
  { id: "googleanalytics", name: "Google Analytics", stage: "measure", markId: "googleanalytics",
    blurb: "Tells you whether the send drove a real win — closes the loop." },
];
