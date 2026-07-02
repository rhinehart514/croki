// gtmMapModel — the read-side model for the GTM map (Phase 3).
//
// It fetches GET /api/projects/:id/gtm-map (the four persisted record lists the rebuilt engine
// produces) and derives, IN CODE, everything the read-only map draws: the ranked portfolio, its
// buckets (strongest / ready / blocked / worked), each path's bet chain resolved against the market
// objects it rests on, and its weak links. Nothing here writes, edits, or triggers a run — the map is
// a pure read (Phase 3 is read-only). No model call anywhere; a function does every derivation.
//
// Founder register: this module also owns the plain-language vocabulary the map speaks — solidity
// labels, bucket names, the facet order — so no engine word (solidity, composite, joinKey) reaches
// the surface untranslated.

import { useEffect, useState } from "react";
import { getGtmMap } from "@/api";
import type {
  GtmMapView, GtmPathRecord, MarketObjectRecord, MeasurementContractRecord, ProductTruthRecord, Solidity,
} from "@/types";

// ── The bet chain: the order a GTM path reads in, buyer-first. Open — any extra facet a path carries
// (a key the model invented) is appended after these in insertion order, never dropped. ──
export const BET_FACET_ORDER = [
  "buyer", "pain", "job", "trigger", "workaround", "valueProp", "offer", "channel", "message", "proof", "conversionPath",
] as const;

// Plain-language name for each known facet. An unknown facet key falls back to a de-camel-cased label.
const FACET_LABELS: Record<string, string> = {
  buyer: "Who", pain: "Their pain", job: "The job", trigger: "Why now", workaround: "What they do today",
  valueProp: "The value", offer: "The offer", channel: "Where you reach them", message: "What you say",
  proof: "The proof", conversionPath: "How they convert",
};

export function facetLabel(key: string): string {
  if (FACET_LABELS[key]) return FACET_LABELS[key];
  const spaced = key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

// ── Solidity, in plain words (never the raw ladder word on the surface). ──
export type SolidityTone = "solid" | "medium" | "weak";
export function solidityText(solidity: Solidity | null | undefined): { label: string; tone: SolidityTone } {
  switch ((solidity ?? "").toLowerCase()) {
    case "observed": return { label: "Seen directly", tone: "solid" };
    case "researched": return { label: "Backed by a source", tone: "solid" };
    case "inferred": return { label: "Reasoned, not seen", tone: "medium" };
    case "speculative": return { label: "A guess so far", tone: "weak" };
    default: return { label: "Not yet grounded", tone: "weak" };
  }
}

function isWeakSolidity(solidity: Solidity | null | undefined): boolean {
  const s = (solidity ?? "").toLowerCase();
  return s === "" || s === "speculative";
}

// ── Measurement completeness, in code (mirrors brain's contractCompleteness: four equal quarters). ──
// Returns how many of the four essentials a contract carries (0..4) — what outcomes to watch, where
// they come from, the key results join on, what success is. A contract missing all four is honestly
// unmeasurable.
export function contractParts(contract: MeasurementContractRecord | null | undefined): number {
  if (!contract) return 0;
  let n = 0;
  if (Array.isArray(contract.outcomeKinds) && contract.outcomeKinds.length) n += 1;
  if (Array.isArray(contract.sources) && contract.sources.length) n += 1;
  if ((contract.joinKey ?? "").trim()) n += 1;
  if ((contract.successCriteria ?? "").trim()) n += 1;
  return n;
}

// One resolved dependency: a record a path rests on, tagged by which side it came from.
export type ResolvedRest = {
  side: "product" | "market";
  id: string;
  kind: string | null; // the market kind (buyer/pain/…) or "Product truth"
  statement: string;
  solidity: Solidity | null;
};

// A weak link the founder should see — a dependency resting on a guess, or a missing measurement plan.
export type WeakLink = { label: string; detail: string };

// One path, fully derived for the map: its resolved chain, its dependencies, its weak links, its
// bucket, and its rank position — all computed here so the view only renders.
export type DerivedPath = {
  path: GtmPathRecord;
  contract: MeasurementContractRecord | null;
  score: number; // 0..1, the code-computed composite (or confidence fallback)
  angle: string | null; // the go-to-market angle this bet takes (open label), for the visible spread
  chain: { key: string; label: string; text: string; rest: ResolvedRest | null; weak: boolean }[];
  rests: ResolvedRest[];
  weakLinks: WeakLink[];
  bucket: PortfolioBucket;
  measurementParts: number; // 0..4
};

// The go-to-market angle is an OPEN field on the path record (the engine tags each bet with the angle
// it took). Read it defensively so the map surfaces the spread without depending on the shared type.
function angleOf(path: GtmPathRecord): string | null {
  const raw = (path as { angle?: string | null }).angle;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

// The buckets the founder filters the portfolio by. Open in spirit — these four are the honest ones
// derivable from stored records today; "worked" stays empty until Phase 5 attaches real outcomes.
export type PortfolioBucket = "strongest" | "ready" | "blocked" | "worked";
export const BUCKET_LABELS: Record<PortfolioBucket, string> = {
  strongest: "Strongest bets",
  ready: "Ready to run",
  blocked: "Needs shoring up",
  worked: "Proven",
};

function scoreOf(path: GtmPathRecord): number {
  const composite = path.rankingSignals?.composite;
  if (typeof composite === "number" && Number.isFinite(composite)) return composite;
  if (typeof path.confidence === "number" && Number.isFinite(path.confidence)) return path.confidence;
  return 0;
}

// Resolve the refs a path rests on into the real records, in the order they were cited.
function resolveRests(
  path: GtmPathRecord,
  truthById: Map<string, ProductTruthRecord>,
  marketById: Map<string, MarketObjectRecord>,
): ResolvedRest[] {
  const out: ResolvedRest[] = [];
  for (const ref of path.restsOn ?? []) {
    if (!ref?.id) continue;
    const truth = truthById.get(ref.id);
    if (truth) {
      out.push({ side: "product", id: truth.id, kind: "Product truth", statement: truth.statement, solidity: truth.solidity });
      continue;
    }
    const market = marketById.get(ref.id);
    if (market) {
      out.push({ side: "market", id: market.id, kind: market.kind, statement: market.statement, solidity: market.solidity });
    }
  }
  return out;
}

// The bet chain, buyer-first, each facet paired to the best market object of that kind the path rests
// on (so a facet's solidity is the solidity of the thing under it). A facet with no matching grounded
// dependency, or one whose match is a guess, is flagged weak.
function buildChain(path: GtmPathRecord, rests: ResolvedRest[]) {
  const bet = path.bet ?? {};
  const keys = [
    ...BET_FACET_ORDER.filter((k) => bet[k]),
    ...Object.keys(bet).filter((k) => !(BET_FACET_ORDER as readonly string[]).includes(k)),
  ];
  return keys.map((key) => {
    // Match this facet to a market object of the same kind among the dependencies.
    const rest = rests.find((r) => r.side === "market" && r.kind === key) ?? null;
    const weak = rest ? isWeakSolidity(rest.solidity) : true; // no grounding under it → weak
    return { key, label: facetLabel(key), text: String(bet[key]), rest, weak };
  });
}

function buildWeakLinks(chain: DerivedPath["chain"], measurementParts: number): WeakLink[] {
  const links: WeakLink[] = [];
  for (const step of chain) {
    if (step.weak) {
      links.push({
        label: step.label,
        detail: step.rest ? "rests on a guess — no source under it yet" : "nothing grounds this yet",
      });
    }
  }
  if (measurementParts === 0) {
    links.push({ label: "Measurement", detail: "no way to tell if this worked yet" });
  }
  return links;
}

// Assign a bucket from stored fields only. "worked" is never fabricated (no outcomes in this payload
// yet — Phase 5). "ready" = a real measurement plan and no weak dependency. "blocked" = has a weak
// link. Everything else falls to "strongest" (the graded core), ordered by score.
function bucketOf(weakLinks: WeakLink[], measurementParts: number): PortfolioBucket {
  if (weakLinks.length > 0) return "blocked";
  if (measurementParts >= 3) return "ready";
  return "strongest";
}

// The whole derivation: the map's ranked, bucketed portfolio. Pure over the fetched payload.
export type GtmMapModel = {
  projectId: string;
  paths: DerivedPath[]; // ranked strongest-first
  counts: Record<PortfolioBucket, number>;
  truthCount: number;
  marketCount: number;
};

export function deriveGtmMap(view: GtmMapView): GtmMapModel {
  const truthById = new Map((view.productTruths ?? []).map((t) => [t.id, t]));
  const marketById = new Map((view.marketObjects ?? []).map((m) => [m.id, m]));
  const contractByPath = new Map<string, MeasurementContractRecord>();
  for (const c of view.contracts ?? []) if (c.pathId) contractByPath.set(c.pathId, c);

  const derived: DerivedPath[] = (view.paths ?? []).map((path) => {
    const contract = contractByPath.get(path.id) ?? (path.measurementContractId
      ? (view.contracts ?? []).find((c) => c.id === path.measurementContractId) ?? null
      : null);
    const rests = resolveRests(path, truthById, marketById);
    const chain = buildChain(path, rests);
    const measurementParts = contractParts(contract);
    const weakLinks = buildWeakLinks(chain, measurementParts);
    const bucket = bucketOf(weakLinks, measurementParts);
    return { path, contract, score: scoreOf(path), angle: angleOf(path), chain, rests, weakLinks, bucket, measurementParts };
  });

  derived.sort((a, b) => b.score - a.score);

  const counts: Record<PortfolioBucket, number> = { strongest: 0, ready: 0, blocked: 0, worked: 0 };
  for (const d of derived) counts[d.bucket] += 1;

  return {
    projectId: view.projectId,
    paths: derived,
    counts,
    truthCount: (view.productTruths ?? []).length,
    marketCount: (view.marketObjects ?? []).length,
  };
}

// ── The fetch hook ──────────────────────────────────────────────────────────────
export type GtmMapState =
  | { status: "loading"; model: null; error: null }
  | { status: "empty"; model: null; error: null }
  | { status: "ready"; model: GtmMapModel; error: null }
  | { status: "error"; model: null; error: string };

// Fetch + derive the GTM map for a project. Re-fetches on project change; ignores a stale resolution
// after the project switched out from under it. "empty" is the honest no-portfolio-yet state (nothing
// composed, or the serving route not present) — never a fabricated portfolio. setState happens ONLY
// inside the async callbacks (never synchronously in the effect body); loading/empty for a null or
// still-resolving project are derived in render.
export function useGtmMap(projectId: string | null, reloadToken = 0): GtmMapState {
  const [fetched, setFetched] = useState<{ projectId: string; state: GtmMapState } | null>(null);

  useEffect(() => {
    if (!projectId) return;
    let live = true;
    getGtmMap(projectId)
      .then((view) => {
        if (!live) return;
        const hasAny = (view.paths ?? []).length > 0;
        const next: GtmMapState = hasAny
          ? { status: "ready", model: deriveGtmMap(view), error: null }
          : { status: "empty", model: null, error: null };
        setFetched({ projectId, state: next });
      })
      .catch((err: unknown) => {
        if (!live) return;
        setFetched({
          projectId,
          state: { status: "error", model: null, error: err instanceof Error ? err.message : String(err) },
        });
      });
    return () => { live = false; };
    // reloadToken lets a caller force a refetch after it invokes a ritual (research / generate paths).
  }, [projectId, reloadToken]);

  if (!projectId) return { status: "empty", model: null, error: null };
  if (fetched && fetched.projectId === projectId) return fetched.state;
  return { status: "loading", model: null, error: null };
}
