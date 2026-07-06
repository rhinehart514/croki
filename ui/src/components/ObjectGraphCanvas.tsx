import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from "react";
import {
  CheckCircle2, FileSearch, LoaderCircle, Mail, Network, Play, Plus, Shield, ShieldCheck,
} from "lucide-react";
import {
  Background, Controls, Handle, MarkerType, Position, ReactFlow, useReactFlow, useStore, type Edge, type Node, type NodeProps, type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { applyObjectGraphOperations, approveRun, compileObjectGraphPath, getObjectGraph, recordOutcome, saveObjectGraphPositions, type CompiledGate } from "@/api";
import type { GateDecision, GTMItem, ObjectGraphEdge, ObjectGraphNode, ObjectGraphPathRecommendation, ObjectGraphView } from "@/types";
import { layoutObjectGraph, type PositionMap } from "@/lib/objectGraphLayout";
import { GateReview } from "@/components/gate/GateReview";
import { ObjectGraphPalette } from "@/components/ObjectGraphPalette";
import { PALETTE_BLOCK_LABEL, PALETTE_DRAG_MIME } from "@/lib/objectPalette";
import { kindIcon } from "@/lib/objectKindIcons";
import type { GateBag } from "@/lib/gateItem";
import type { CanvasSubject, CardDetail } from "@/lib/cardDetail";
import "@/styles/object-graph.css";

function labelForType(type: string | null) {
  return String(type || "loose").replace(/_/g, " ");
}

// The verb an edge asserts, in plain words — "leads_to" → "leads to", "measured_by" → "measured by".
// Surfaced as a small label on the lit edges so a connection reads as a claim, not a bare stroke.
function edgeVerb(type: string | null): string {
  return String(type || "").replace(/_/g, " ").trim();
}

// A bare placeholder node — an under-specified card that renders as filler ("New buyer", "ref", or an
// empty statement). These clutter the map without saying anything, so the projection hides them. A
// founder's OWN freshly dropped card (origin "founder") is intentional and always kept, even before it
// has substance, so drag-to-create never vanishes under the founder's cursor.
function isPlaceholderNode(node: ObjectGraphNode): boolean {
  // Bare filler is dropped whatever its origin — a lingering "New buyer" / "ref" with no substance made
  // the whole map read as unfinished scaffolding. (Ideation lands cards WITH content, so a bare drop is
  // stale, not in-progress.)
  const s = (node.statement || "").trim();
  if (!s) return true;
  if (/^ref$/i.test(s)) return true;
  if (/^new\s+[\w-]+$/i.test(s)) return true;
  return false;
}

// One consistent evidence ladder (observed / researched / inferred / speculative / founder /
// unsupported), with a source count only when there's more than one — no mixing "scan ·3" with
// a bare "inferred".
function evidenceLabel(node: ObjectGraphNode) {
  if (node.origin === "founder") return "founder";
  if (!node.solidity) return "unsupported";
  const n = node.sources.length || node.evidence.length || 0;
  return n > 1 ? `${node.solidity} ·${n}` : node.solidity;
}

// The card's GROUNDING weight — how solidly the belief is established, compressed from the six-rung
// evidence ladder to three visual tiers. This is what lets a founder scan the board and SEE which
// beliefs are load-bearing versus guessed, instead of reading every foot badge:
//   solid       — observed / researched: grounded in real outside evidence, the backbone.
//   reasoned    — inferred: reasoned from evidence, plausible but not proven.
//   provisional — speculative / founder-asserted / unsupported: a hunch, not yet grounded.
// The big visual break sits at the grounded/not-grounded line (reasoned→provisional), where it
// belongs. Belief cards only — a gate/outcome/outward node isn't a "guessed belief", so it keeps its
// own role styling and gets no grounding tier (see the className guard on nodeRole === "object").
function groundingTier(node: ObjectGraphNode): "solid" | "reasoned" | "provisional" {
  if (node.origin === "founder") return "provisional"; // the founder's own claim is unverified, not evidence
  switch (node.solidity) {
    case "observed":
    case "researched":
      return "solid";
    case "inferred":
      return "reasoned";
    default: // speculative, unsupported, or no solidity at all
      return "provisional";
  }
}

// The card's honest STATE tone, driving the selected ring + the inspector's type chip. Semantic color
// only: amber = a weakness needs review, green = observed/worked, gray = an unproven draft, zinc = the
// plain grounded middle. Weakness wins the ring so the amber warning always shows through.
function cardTone(node: ObjectGraphNode): "amber" | "green" | "gray" | "neutral" {
  if (primaryWeakness(node)) return "amber";
  if (node.solidity === "observed") return "green";
  if (!node.solidity || node.maturity === "loose") return "gray";
  return "neutral";
}

function primaryWeakness(node: ObjectGraphNode) {
  const order = ["performance", "execution", "measurement", "product", "specificity", "evidence"];
  return [...(node.weaknesses ?? [])]
    .filter((weakness) => weakness.status === "open")
    .sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind))[0] ?? null;
}

// One hop out from a card: every card it's wired to, with the edge's verb, deduped by the other card's
// id and capped so the list stays scannable. Used to build the composer card face's Related list (a
// click there re-targets the composer to that card) — the same walk the retired inspector did.
function relatedFor(node: ObjectGraphNode, view: ObjectGraphView): { node: ObjectGraphNode; verb: string }[] {
  const seen = new Set<string>();
  const out: { node: ObjectGraphNode; verb: string }[] = [];
  for (const edge of view.graph.edges) {
    if (edge.source !== node.id && edge.target !== node.id) continue;
    const otherId = edge.source === node.id ? edge.target : edge.source;
    if (otherId === node.id || seen.has(otherId)) continue;
    const other = view.graph.nodes.find((n) => n.id === otherId);
    if (!other) continue;
    seen.add(otherId);
    out.push({ node: other, verb: edge.type });
  }
  return out.slice(0, 8);
}

// The card's full face for the composer, built from the SAME helpers the card and the old inspector
// used — no new derivation. Receipts prefer the scan sources (each with its ref + provenance), falling
// back to the evidence ledger; the provenance kind rides along so the composer renders a guess softer
// than a grounded fact. Clamped to six so the face stays scannable.
function computeCardDetail(node: ObjectGraphNode, view: ObjectGraphView): CardDetail {
  const weakness = primaryWeakness(node);
  const rawReceipts = node.sources.length
    ? node.sources
    : node.evidence.map((item) => ({ ref: item.source || "evidence", preview: item.claim || item.notes || "Evidence", kind: item.solidity, at: item.capturedAt }));
  return {
    id: node.id,
    statement: node.statement,
    type: node.type ?? "block",
    maturity: node.maturity,
    tone: cardTone(node),
    evidenceLabel: evidenceLabel(node),
    receipts: rawReceipts.slice(0, 6).map((receipt) => ({ preview: receipt.preview, kind: receipt.kind ?? null, ref: receipt.ref })),
    related: relatedFor(node, view).map(({ node: other, verb }) => ({ id: other.id, verb, name: other.statement })),
    weakness: weakness ? { statement: weakness.statement, repair: weakness.repair?.statement ?? "Repair suggested from the detector." } : null,
  };
}

function weaknessShort(kind: string) {
  if (kind === "evidence") return "thin evidence";
  if (kind === "product") return "no product proof";
  if (kind === "measurement") return "no attribution";
  if (kind === "execution") return "no list";
  if (kind === "performance") return "not converting";
  if (kind === "specificity") return "too broad";
  return kind;
}

function nodeRole(node: ObjectGraphNode) {
  if (node.domain === "runs" && node.type === "gate") return "gate";
  if (node.maturity === "outcome") return "outcome";
  if (node.maturity === "execution" && (node.payload?.protects || node.payload?.reviewPayload)) return "outward";
  return "object";
}

function cardIcon(node: ObjectGraphNode) {
  const role = nodeRole(node);
  if (role === "gate") return <Shield aria-hidden="true" />;
  if (role === "outward") return <Mail aria-hidden="true" />;
  if (role === "outcome") return <CheckCircle2 aria-hidden="true" />;
  const Icon = kindIcon(node.type);
  return <Icon aria-hidden="true" />;
}

type CardData = {
  object: ObjectGraphNode;
  lit: boolean;
  weak: boolean;
  weakest: boolean;
  revealDelay: number;
  // The per-card "+" that ideates the NEXT move off this card. Fired with the card's own identity and
  // a plain target (see ideateTargetFor); the host scopes the composer to the card and runs the real
  // grounded ideate. Absent when the canvas isn't wired for ideation.
  onIdeate?: (source: { id: string; label: string; type: string }, target: string) => void;
  // Blue-violet "Claude working" state while THIS card is the one being ideated off of — watchable,
  // with the step named ("ideating triggers…"), never an anonymous spinner.
  ideating: boolean;
  ideatingTarget: string | null;
};

// The plain target the "+" ideates off a card — the NEXT beat in the buyer story, keyed by the card's
// type so the move reads as forward motion (a buyer → its triggers, an offer → its channels). Founder
// words only, and the server still classifies each idea's own type; this is just the framing noun.
const IDEATE_TARGET: Record<string, string> = {
  buyer: "triggers", icp: "triggers",
  pain: "value props", job: "value props",
  trigger: "messages",
  workaround: "value props", competitor: "value props",
  value_prop: "proof", positioning: "proof",
  proof_point: "messages",
  offer: "channels",
  channel: "messages",
  message: "variations", objection: "answers",
  path: "next moves", conversion_path: "next moves",
};
function ideateTargetFor(type: string | null): string {
  return IDEATE_TARGET[String(type || "")] ?? "related cards";
}

// The cold-open materializes the graph in WAVES, not one card at a time: the product cards land first,
// then market, then strategy, then the run/gate/outcome layer — so it reads as Drover laying out its
// thinking. Delay is by lifecycle layer (a shared beat per wave) plus a small deterministic jitter so a
// wave doesn't pop perfectly in lockstep.
const REVEAL_WAVE: Record<string, number> = {
  external: 0, product: 0, market: 1, strategy: 2,
  audience: 3, assets: 3, runs: 3, measurement: 4, pipeline: 4, customer: 4, learning: 4,
};
function revealDelayFor(node: ObjectGraphNode) {
  const wave = REVEAL_WAVE[node.domain || "product"] ?? 2;
  const jitter = node.id ? (node.id.charCodeAt(0) % 5) * 30 : 0;
  return wave * 240 + jitter;
}

// The canvas is a projection over an object model, so a node should read as the THING it is — a buyer,
// an offer, a message, a gate — not one card template repeated. `objectKind` sorts each node to a body
// that surfaces its own defining field; every kind keeps the shared skeleton (type row + evidence foot)
// so the map stays one family, differentiated but not chaotic.
type ObjectKind = "persona" | "offer" | "message" | "value" | "proof" | "trigger" | "channel" | "gate" | "outcome" | "default";
function objectKind(node: ObjectGraphNode): ObjectKind {
  const role = nodeRole(node);
  if (role === "gate") return "gate";
  if (role === "outcome") return "outcome";
  switch (node.type) {
    case "buyer": return "persona";
    case "offer": return "offer";
    case "message": return "message";
    case "value_prop": return "value";
    case "proof_point": return "proof";
    case "trigger": return "trigger";
    case "channel": return "channel";
    default: return "default";
  }
}

// Stage columns — the LENS that lays the graph out as the buyer story: one column per object TYPE,
// left to right in the order a market picture is actually told (who we help → what hurts → … → what we
// say → the play → the gate → what came back). Each column names itself AND says in plain words what it
// holds, so the founder can read what every stage IS. This is the fix for the old "Market picture" band,
// which crammed ten different types into one unlabelled blob. Still a way of SEEING, never a track a run
// is forced onto — the "Flow" view restores the free causal graph, and an empty type claims no column,
// so the lens only ever shows the stages that are real. Types are grouped, not hard-coded per node: a
// node lands in the first column whose `types` list matches, so a new object kind just needs a home here.
const STAGE_COLUMNS = [
  { key: "product", label: "Product", sub: "What it does", types: [] },
  { key: "buyer", label: "Buyer", sub: "Who we help", types: ["buyer", "icp"] },
  { key: "pain", label: "Pain", sub: "What hurts", types: ["pain"] },
  { key: "job", label: "Job", sub: "What they want", types: ["job"] },
  { key: "trigger", label: "Trigger", sub: "What kicks it off", types: ["trigger"] },
  { key: "workaround", label: "Workaround", sub: "What they do now", types: ["workaround", "competitor"] },
  { key: "value", label: "Value Prop", sub: "Why we're different", types: ["value_prop", "positioning"] },
  { key: "proof", label: "Proof", sub: "Why believe us", types: ["proof_point"] },
  { key: "offer", label: "Offer", sub: "What we offer", types: ["offer"] },
  { key: "channel", label: "Channel", sub: "Where we reach them", types: ["channel"] },
  { key: "message", label: "Message", sub: "What we say", types: ["message", "objection"] },
  { key: "path", label: "Path", sub: "The play", types: ["path", "conversion_path"] },
  { key: "run", label: "Run", sub: "Staged to the gate", types: ["run"] },
  { key: "gate", label: "Gate", sub: "Founder approval", types: [] },
  { key: "outcome", label: "Outcome", sub: "What came back", types: [] },
] as const;
type StageColKey = (typeof STAGE_COLUMNS)[number]["key"];
function stageColumnKey(node: ObjectGraphNode): StageColKey {
  const role = nodeRole(node);
  const d = node.domain || "";
  const t = node.type || "";
  // The result/execution columns are decided by role/domain, not type: an outcome, a gate, and a staged
  // run each read from where they sit in the loop, so they land in their own column even when their raw
  // type is generic.
  if (role === "outcome" || node.maturity === "outcome" || d === "measurement" || d === "learning") return "outcome";
  if (role === "gate") return "gate";
  if (t === "path" || t === "conversion_path") return "path";
  if (t === "run" || (d === "runs" && node.maturity === "execution")) return "run";
  for (const col of STAGE_COLUMNS) {
    if ((col.types as readonly string[]).includes(t)) return col.key;
  }
  return "product"; // product facts / capabilities / anything unclassified grounds the picture
}

// Typed-column geometry. Every column is one object type, evenly pitched left to right, cards stacked
// straight down in a clean grid (no stagger — the reference the founder chose reads as aligned columns,
// not a loose desk). A pathologically tall column (many of one type) wraps into a second sub-column at the
// same pitch so it never runs off the bottom; the common case is one stack per type.
const COL_STEP_X = 258; // card (214) + gap, one type-column to the next
const COL_ROW_H = 176; // one card to the next within a column
const COL_MAX_ROWS = 8; // a very tall column wraps into a second sub-column past this
const BAND_TOP = 168;
const BAND_LEFT = 48;
function layoutBandedPositions(nodes: ObjectGraphNode[]): { positions: PositionMap; cols: { key: StageColKey; label: string; sub: string; x: number; index: number }[] } {
  const byCol = new Map<StageColKey, ObjectGraphNode[]>();
  for (const n of nodes) {
    const key = stageColumnKey(n);
    (byCol.get(key) ?? byCol.set(key, []).get(key)!).push(n);
  }
  const positions: PositionMap = {};
  const cols: { key: StageColKey; label: string; sub: string; x: number; index: number }[] = [];
  let x = BAND_LEFT;
  let index = 0;
  for (const col of STAGE_COLUMNS) {
    const list = byCol.get(col.key);
    if (!list || !list.length) continue; // an empty type claims no column — the lens shows only what's real
    index += 1;
    cols.push({ key: col.key, label: col.label, sub: col.sub, x, index });
    const subCols = Math.ceil(list.length / COL_MAX_ROWS);
    list.forEach((n, i) => {
      const sc = Math.floor(i / COL_MAX_ROWS);
      const row = i % COL_MAX_ROWS;
      positions[n.id] = { x: x + sc * COL_STEP_X, y: BAND_TOP + row * COL_ROW_H };
    });
    x += subCols * COL_STEP_X;
  }
  return { positions, cols };
}

// An offer states its own price sheet ("Presence $99 / Growth $199 / Scale $499 · per month"); pull the
// tiers out so the object reads as prices, and keep the trailing qualifier as a subline.
// A price is "$" + digits with optional thousands separators ($99, $1,000) — a comma only counts when
// it sits between digit groups, so a list separator ("$99, Growth") never gets swallowed into the price.
const PRICE = String.raw`\$\d{1,3}(?:,\d{3})*`;
function parseOfferTiers(statement: string): { name?: string; price: string }[] {
  const paired = [...statement.matchAll(new RegExp(`([A-Z][A-Za-z]+)\\s+(${PRICE})`, "g"))].map((m) => ({ name: m[1], price: m[2] }));
  if (paired.length) return paired;
  return [...statement.matchAll(new RegExp(PRICE, "g"))].map((m) => ({ price: m[0] }));
}
function offerTail(statement: string): string {
  const idx = statement.lastIndexOf("$");
  if (idx < 0) return "";
  return statement.slice(idx).replace(new RegExp(`^${PRICE}`), "").replace(/^[\s·,/-]+/, "").trim();
}

function ObjectBody({ node, kind }: { node: ObjectGraphNode; kind: ObjectKind }) {
  const statement = node.statement;
  if (kind === "offer") {
    const tiers = parseOfferTiers(statement);
    if (tiers.length) {
      const tail = offerTail(statement);
      return (
        <div className="obj-body obj-offer">
          <div className="obj-price-row">
            {tiers.map((t) => (
              <span className="obj-price" key={`${t.name ?? ""}-${t.price}`}>
                {t.name ? <em>{t.name}</em> : null}
                {t.price}
              </span>
            ))}
          </div>
          {tail ? <div className="obj-offer-tail">{tail}</div> : null}
        </div>
      );
    }
  }
  if (kind === "persona") {
    // The type row already carries the buyer glyph — the body is just the who, no second avatar.
    return <div className="obj-body obj-text obj-persona-who">{statement}</div>;
  }
  if (kind === "trigger") {
    return (
      <div className="obj-body obj-trigger">
        <span className="obj-now">now</span>
        <span className="obj-text obj-trigger-when">{statement}</span>
      </div>
    );
  }
  if (kind === "channel") {
    return (
      <div className="obj-body obj-channel">
        <span className="obj-via">via</span>
        <span className="obj-text obj-channel-venue">{statement}</span>
      </div>
    );
  }
  if (kind === "gate") {
    return (
      <div className="obj-body obj-gate">
        <span className="obj-gate-bar" aria-hidden="true" />
        <span className="obj-text">{statement}</span>
      </div>
    );
  }
  // message (a literal quote), value (a positioning claim), proof (evidence), and the plain default all
  // render the statement, but each with its own frame in CSS via the kind class.
  return <div className={`obj-body obj-text obj-${kind}`}>{statement}</div>;
}

function ObjectCard({ data, selected }: NodeProps<Node<CardData>>) {
  const weakness = primaryWeakness(data.object);
  const kind = objectKind(data.object);
  const role = nodeRole(data.object);
  // The "+" ideates the next move off this card; a gate/outcome node has no "next card" to seed, so
  // it doesn't offer one. The target is the plain next-beat noun for this card's type.
  const canIdeate = Boolean(data.onIdeate) && role !== "gate" && role !== "outcome";
  const target = ideateTargetFor(data.object.type);
  return (
    <button
      type="button"
      data-kind={kind}
      style={{ "--reveal-delay": `${data.revealDelay}ms` } as CSSProperties}
      className={[
        "object-card",
        `kind-${kind}`,
        `role-${role}`,
        // Grounding weight is a belief property — only the object cards carry it; a gate/outcome/outward
        // node keeps its role styling untouched.
        role === "object" && `ground-${groundingTier(data.object)}`,
        data.object.maturity,
        data.lit && "lit",
        data.weak && "weak",
        data.weakest && "weakest",
        data.ideating && "ideating",
        selected && "selected",
      ].filter(Boolean).join(" ")}
    >
      <Handle type="target" position={Position.Left} className="object-handle" />
      {nodeRole(data.object) === "outward" ? (
        <div className="object-outward-band">Reaches outside · {String(data.object.payload?.protects || "staged")}</div>
      ) : null}
      <div className="object-card-type">
        {cardIcon(data.object)}
        <span>{labelForType(data.object.type)}</span>
      </div>
      <ObjectBody node={data.object} kind={kind} />
      <div className="object-card-foot">
        <span className={`object-evidence ${data.object.solidity || "unsupported"}`}>{evidenceLabel(data.object)}</span>
        {weakness ? (
          <span className="object-weakness" title={weakness.statement}>
            <span className="object-weakness-dot" aria-hidden="true" />
            {weaknessShort(weakness.kind)}
          </span>
        ) : null}
      </div>
      {data.weakest && weakness ? (
        <div className="object-weakest-pill">weakest link · {weaknessShort(weakness.kind)}</div>
      ) : null}
      {/* The per-card "+" — hover-revealed, calm, monochrome (Langdock's on-node shape). Clicking it
          asks Claude to ideate the next move off this card in the composer. A span (not a nested
          button — the card root is already a button) with full keyboard access. */}
      {canIdeate ? (
        <span
          className="object-card-plus"
          role="button"
          tabIndex={0}
          title={`Ideate ${target}`}
          aria-label={`Ideate ${target} off ${data.object.statement}`}
          onClick={(event) => {
            event.stopPropagation();
            data.onIdeate?.({ id: data.object.id, label: data.object.statement, type: data.object.type ?? "block" }, target);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              event.stopPropagation();
              data.onIdeate?.({ id: data.object.id, label: data.object.statement, type: data.object.type ?? "block" }, target);
            }
          }}
        >
          <Plus aria-hidden="true" />
        </span>
      ) : null}
      {/* Blue-violet "Claude working" beat while this card is being ideated off of — the step named,
          never an anonymous spinner. */}
      {data.ideating ? (
        <span className="object-card-ideating" aria-hidden="true">
          <LoaderCircle className="spin" />
          ideating {data.ideatingTarget ?? target}…
        </span>
      ) : null}
      <Handle type="source" position={Position.Right} className="object-handle" />
    </button>
  );
}

const nodeTypes = { objectCard: ObjectCard };

function layoutNodes(
  nodes: ObjectGraphNode[],
  positions: PositionMap,
  highlighted: Set<string>,
  weakestNodeId: string | null,
  onIdeate: CardData["onIdeate"],
  ideatingNodeId: string | null,
  ideatingTarget: string | null,
  selectedId: string | null,
): Node<CardData>[] {
  return nodes.map((object) => {
    const weak = Boolean(primaryWeakness(object));
    return {
      id: object.id,
      type: "objectCard",
      position: positions[object.id] ?? { x: 0, y: 0 },
      // Drive the selection ring from our own selectedId (not just React Flow's click selection) so the
      // ring follows a programmatic re-target — clicking a Related card in the composer re-selects here.
      selected: object.id === selectedId,
      data: {
        object,
        lit: highlighted.has(object.id),
        weak,
        weakest: object.id === weakestNodeId,
        revealDelay: revealDelayFor(object),
        onIdeate,
        ideating: object.id === ideatingNodeId,
        ideatingTarget,
      },
    };
  });
}

function layoutEdges(edges: ObjectGraphEdge[], highlighted: Set<string>): Edge[] {
  return edges.map((edge) => {
    const lit = highlighted.has(edge.id);
    const gateEdge = /:gate:/.test(edge.source) || /:gate:/.test(edge.target);
    // The one true loop in GTM is learning updating belief — the `updates` edge type. It points
    // backward against the left→right flow, so it's drawn as a curved, muted return stroke and never
    // masquerades as forward causality. (Attachment edges like `supports` can also point backward but
    // are not loops — they stay ordinary faint edges.)
    const feedback = edge.type === "updates";
    const verb = edgeVerb(edge.type);
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      // Edge-type label, but ONLY on the LIT edges (the strongest-path spine). Labeling every edge at
      // once smears illegibly where edges converge, so the unlit web stays bare strokes; the lit spine
      // names its verb — "leads to", "supports", "measured by", "updates" — so the path you're reading
      // reads as a chain of claims, not anonymous lines. The full per-edge verb still lists in the card
      // face one click away.
      label: lit && verb ? verb : undefined,
      labelShowBg: true,
      labelBgPadding: [6, 3] as [number, number],
      labelBgBorderRadius: 4,
      labelStyle: { fill: "var(--ink-2)", fontSize: 11, fontWeight: 600, letterSpacing: "0.01em" },
      labelBgStyle: { fill: "var(--surface)", stroke: "var(--line-2)", strokeWidth: 1 },
      type: feedback ? "smoothstep" : "default",
      // Every edge carries an arrowhead so direction reads at a glance (the n8n move — flow you can see,
      // not floating dots joined by faint threads). The lit spine gets a bold ink arrow; forward edges a
      // small muted one; the feedback loop its own amber return marker.
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: lit ? 17 : 12,
        height: lit ? 17 : 12,
        color: lit ? "var(--ink)" : feedback ? "var(--gap)" : "var(--faint)",
      },
      className: ["object-edge", gateEdge && "gate", feedback && "feedback", lit && "lit"].filter(Boolean).join(" "),
      data: { object: edge },
    };
  });
}

function FitOnLoad({ ready, refitSignal, leftInset }: { ready: boolean; refitSignal: number; leftInset: number }) {
  const rf = useReactFlow();
  useEffect(() => {
    if (!ready) return;
    const t = window.setTimeout(() => {
      // Fit instantly, then pan right so the left edge clears the Blocks rail (which floats OVER the
      // canvas) — otherwise the first column lands under it. Collapsed rail → no shift.
      void rf.fitView({ padding: 0.2, duration: 0 });
      const vp = rf.getViewport();
      const shift = leftInset > 80 ? leftInset - 60 : 0;
      rf.setViewport({ x: vp.x + shift, y: vp.y, zoom: vp.zoom }, { duration: 420 });
    }, 50);
    return () => window.clearTimeout(t);
  }, [ready, rf, refitSignal, leftInset]);
  return null;
}

// Stages fit: never zoom out to fit the whole map (that shrinks cards to unreadable coins). Instead fit
// the bands to the width so the left-to-right stages all show, at a zoom where cards stay readable, and
// anchor to the top — the founder reads a band top-to-bottom and scrolls down through it.
function StagesFit({ bounds, ready, refitSignal, leftInset }: { bounds: { minX: number; width: number } | null; ready: boolean; refitSignal: number; leftInset: number }) {
  const rf = useReactFlow();
  const vw = useStore((s) => s.width);
  useEffect(() => {
    if (!ready || !bounds || !vw) return;
    const t = window.setTimeout(() => {
      // Land at a comfortably readable zoom. The Blocks rail floats OVER the left of the canvas, so the
      // usable width and the left margin both subtract its width — otherwise the first stage column
      // lands under the rail. If the bands are wider than the frame, we don't shrink to fit them all —
      // cards stay legible and the founder pans right to the later stages (still one canvas).
      const zoom = Math.min(0.9, Math.max(0.62, (vw - leftInset - 40) / bounds.width));
      // band-header row sits at BAND_TOP-76; land it just below the path header, clear of the rail.
      const x = leftInset - bounds.minX * zoom;
      const y = 188 - (BAND_TOP - 76) * zoom;
      rf.setViewport({ x, y, zoom }, { duration: 420 });
    }, 60);
    return () => window.clearTimeout(t);
  }, [ready, bounds, vw, refitSignal, rf, leftInset]);
  return null;
}

// Compact (coin) mode must track the LIVE zoom, not just user drags: the auto-fit can land the whole
// wide graph at a deep zoom where full cards downscale into illegible dark smears. Subscribing to the
// store's zoom flips to coins whenever the graph is pulled back — on fit, wheel, buttons, or a drag.
const COMPACT_BELOW = 0.5;
function ZoomWatch({ onZoom }: { onZoom: (compact: boolean) => void }) {
  const zoom = useStore((s) => s.transform[2]);
  useEffect(() => { onZoom(zoom < COMPACT_BELOW); }, [zoom, onZoom]);
  return null;
}

// Band header labels for the stages lens. They ride the canvas transform so each label stays over
// its column as you pan and zoom, but the text itself keeps a constant size so it never blurs out.
function BandHeaders({ cols }: { cols: { key: string; label: string; sub: string; x: number; index: number }[] }) {
  const [tx, ty, zoom] = useStore((s) => s.transform);
  return (
    <div className="band-headers" aria-hidden="true">
      {cols.map((c) => (
        <div
          key={c.key}
          className="band-header"
          style={{ transform: `translate(${tx + c.x * zoom}px, ${ty + (BAND_TOP - 76) * zoom}px)` }}
        >
          <span className="band-header-top">
            <span className="bn">{c.index}</span>
            <span className="bl">{c.label}</span>
          </span>
          <span className="bs">{c.sub}</span>
        </div>
      ))}
    </div>
  );
}

export function ObjectGraphCanvas({ projectId, gate, onSubjectChange, subjectId = null, desiredArrange, modeControlled = false, onIdeateObject, ideatingNodeId = null, ideatingTarget = null, reloadSignal = 0 }: {
  projectId: string | null;
  gate?: GateBag | null;
  // The attached-composer tie: whenever the founder selects (or deselects) a block on the canvas, we
  // hand its identity up so the composer can dock to it — "Claude · editing offer" — and frame the
  // next message with it. Fired only from selection events, never during render, so it can't loop.
  onSubjectChange?: (subject: CanvasSubject | null) => void;
  // The composer's current subject id, fed BACK down so the tie is two-way: when the founder detaches
  // the composer (its ×, or by sending a message), the selected card lets go too — no orphaned
  // selection with the detail panel stuck open.
  subjectId?: string | null;
  // The mode switcher above the canvas drives the arrangement: Move re-projects the story bands
  // ("stages"), Engineer opens the free causal graph ("flow"). It only steers when it CHANGES.
  desiredArrange?: "stages" | "flow";
  // When the mode pill (Move/Engineer) owns the arrangement, the in-header arrange toggle is redundant —
  // hide it so there's one control for the same job, not two.
  modeControlled?: boolean;
  // The per-card "+" seam: the host owns the ideation (it runs the real endpoint and renders the
  // candidate list in the composer, an App-level surface), so the canvas just hands up which card the
  // founder wants the next move off and the plain target. `ideatingNodeId` lights that card in the
  // blue-violet "Claude working" state while the call runs; `reloadSignal` bumps after the founder
  // adds a candidate so the fresh draft card appears joined to its source.
  onIdeateObject?: (source: { id: string; label: string; type: string }, target: string) => void;
  ideatingNodeId?: string | null;
  ideatingTarget?: string | null;
  reloadSignal?: number;
}) {
  const gatePending = !!gate?.items.length;
  const [view, setView] = useState<ObjectGraphView | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // A ref mirror of the selection so `load` (a stable callback) can read the current value without
  // taking selectedId as a dependency (which would rebuild the loader on every click).
  const selectedIdRef = useRef<string | null>(null);
  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);
  // Two-way composer tie: when the composer detaches (subjectId → null from the ×/send in App), the
  // selected card lets go too; and when the composer RE-TARGETS to another card (a Related click in the
  // card face flips subjectId to a card in this view we don't have selected), follow it — select that
  // card here. The emit-detail effect below then hands its full card face back up, so the composer
  // re-scopes without the panel closing. Adjusted during render (React's endorsed "reset state when a
  // prop changes" pattern), not in an effect. The membership guard keeps a foreign subject id (a
  // node-graph step handed to the shared composer while this lens isn't the one selected) from ever
  // hijacking selection here.
  const [lastSubjectId, setLastSubjectId] = useState<string | null>(subjectId);
  if (subjectId !== lastSubjectId) {
    setLastSubjectId(subjectId);
    if (subjectId === null) setSelectedId(null);
    else if (subjectId !== selectedId && view?.graph.nodes.some((n) => n.id === subjectId)) setSelectedId(subjectId);
  }
  const [lens, setLens] = useState<"default" | "weakness">("default");
  // Arrangement is a LENS, not a layout the data is locked into: "stages" arranges cards into the
  // operating-story bands; "flow" restores the free causal graph (founder drags persist there).
  const [arrange, setArrange] = useState<"stages" | "flow">(desiredArrange ?? "stages");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [compileState, setCompileState] = useState<{ status: "idle" | "running" | "done" | "error"; message: string }>({ status: "idle", message: "" });
  // The staged compiled run's own founder gate. compile stages a run and blooms its gate here; the
  // founder's per-item decisions hit the approve route, which releases the run through the same engine
  // (staging approved items locally — nothing sends). Separate from the operator-session `gate` prop.
  const [runGate, setRunGate] = useState<CompiledGate | null>(null);
  const [placed, setPlaced] = useState<PositionMap>({});
  const reduceMotion = useMemo(
    () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
    [],
  );
  // The Blocks rail owns its collapsed state up here so the fit can clear its width (it floats over the
  // canvas): expanded → 224px left margin, collapsed → a slim 64px. Toggling it re-fits.
  const [paletteCollapsed, setPaletteCollapsed] = useState(false);
  const paletteInset = paletteCollapsed ? 64 : 224;
  // Reduced-motion starts already-revealed (no animation); otherwise the effect below plays the waves.
  const [cardsIn, setCardsIn] = useState(reduceMotion);
  const [ignited, setIgnited] = useState(reduceMotion);
  const revealedRef = useRef(false);
  const finishReveal = useCallback(() => { setCardsIn(true); setIgnited(true); }, []);
  // Level-of-detail: pulled back, full cards collapse to coins so the whole map reads as a constellation;
  // zoom in and the detail returns. Only flips the boolean at the threshold, not on every wheel tick.
  const [compact, setCompact] = useState(false);
  const onZoomCompact = useCallback((c: boolean) => setCompact((prev) => (prev === c ? prev : c)), []);
  // Bumped by Reorganize so the view re-fits after the graph snaps back to order.
  const [refitSignal, setRefitSignal] = useState(0);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const next = await getObjectGraph(projectId);
      setView(next);
      // Seed founder placements from the saved layout sidecar; the server is the source of truth for
      // where cards sit. Nodes without a saved position fall through to the ordered dagre pass.
      setPlaced((next.positions ?? {}) as PositionMap);
      // A refresh that drops the selected block detaches the composer too, so it never claims to be
      // editing something no longer on the canvas. Decided outside the state updater (updaters must be
      // pure — StrictMode double-invokes them, and this notifies another component).
      const dropped = selectedIdRef.current && !next.graph.nodes.some((node) => node.id === selectedIdRef.current);
      if (dropped) { setSelectedId(null); onSubjectChange?.(null); }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [projectId, onSubjectChange]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  // The host bumps reloadSignal after the founder adds an ideated candidate (it does the real add_node
  // + provenance add_edge write from the composer), so the fresh draft card appears joined to its
  // source without a full remount. Skips the initial 0 so it never double-loads on mount.
  const reloadedRef = useRef(reloadSignal);
  useEffect(() => {
    if (reloadSignal === reloadedRef.current) return;
    reloadedRef.current = reloadSignal;
    void load();
  }, [reloadSignal, load]);

  // Cold-open reveal: once the graph first arrives, materialize the cards in waves, then ignite the
  // path. Plays once per mount; reduced-motion drops straight to the finished state.
  const hasNodes = (view?.graph.nodes.length ?? 0) > 0;
  useEffect(() => {
    if (!hasNodes || revealedRef.current || reduceMotion) return;
    revealedRef.current = true;
    const raf = requestAnimationFrame(() => setCardsIn(true));
    const t = window.setTimeout(() => setIgnited(true), 1500);
    return () => { cancelAnimationFrame(raf); window.clearTimeout(t); };
  }, [hasNodes, reduceMotion]);

  // The mode pill above the canvas steers the arrangement, but only on an actual change — so flipping
  // to Move snaps to the story bands and Engineer opens the causal graph, while the in-canvas toggle and
  // the drop-to-flow still move the map freely inside a mode without being yanked back. This is React's
  // adjust-state-during-render pattern (not an effect): compare the incoming mode to the last one we
  // acted on and re-project only on the transition.
  const [appliedArrange, setAppliedArrange] = useState(desiredArrange);
  if (desiredArrange && desiredArrange !== appliedArrange) {
    setAppliedArrange(desiredArrange);
    setArrange(desiredArrange);
    setRefitSignal((s) => s + 1);
  }

  const highlightedPath = view?.recommendation.highlighted[0] ?? null;
  const highlightedNodes = useMemo(() => new Set(highlightedPath?.nodeIds ?? []), [highlightedPath]);
  const highlightedEdges = useMemo(() => new Set(highlightedPath?.edgeIds ?? []), [highlightedPath]);
  const weakestNodeId = highlightedPath?.weakestLink?.nodeId ?? null;
  // Canvas altitude: show the objects (product / market / strategy), the run and gate summaries,
  // outcomes, and anything on the lit path — but hide the execution detail (the per-item measurement
  // and asset nodes) so the map reads at the altitude you actually think at. You drill into a run to
  // see its items; the rest of the graph stays a clean strategy map, not an item-level hairball.
  const visible = useMemo(() => {
    const all = view?.graph.nodes ?? [];
    // Altitude filter (keep the strategy map, hide per-item execution detail) AND a placeholder filter
    // (drop bare filler cards) — a node on the lit path is always kept regardless, so the spine never
    // loses a link.
    const kept = all.filter(
      (n) =>
        highlightedNodes.has(n.id) ||
        ((n.maturity !== "execution" || n.domain === "runs") && !isPlaceholderNode(n)),
    );
    // Collapse exact-duplicate run and gate cards into one representative each: the same staged run
    // ("Run staged for path-…") repeated across paths, and the same founder-approval gate ("Founder
    // approval for local/http") repeated across pipelines, otherwise stack up as identical cards. The
    // signature is role + normalized statement; a lit node is never deduped away, and its signature is
    // reserved first so a lit card wins over its non-lit twin.
    const dupSig = (n: ObjectGraphNode): string | null => {
      const role = nodeRole(n);
      const isRun = stageColumnKey(n) === "run";
      if (role !== "gate" && !isRun) return null;
      return `${role === "gate" ? "gate" : "run"}:${(n.statement || "").trim().toLowerCase()}`;
    };
    const claimed = new Set<string>();
    for (const n of kept) {
      if (!highlightedNodes.has(n.id)) continue;
      const sig = dupSig(n);
      if (sig) claimed.add(sig);
    }
    const keep = kept.filter((n) => {
      if (highlightedNodes.has(n.id)) return true;
      const sig = dupSig(n);
      if (!sig) return true;
      if (claimed.has(sig)) return false;
      claimed.add(sig);
      return true;
    });
    const ids = new Set(keep.map((n) => n.id));
    return {
      nodes: keep,
      edges: (view?.graph.edges ?? []).filter((e) => ids.has(e.source) && ids.has(e.target)),
    };
  }, [view, highlightedNodes]);
  const banded = useMemo(() => layoutBandedPositions(visible.nodes), [visible]);
  const stagesBounds = useMemo(() => {
    const pts = Object.values(banded.positions);
    if (!pts.length) return null;
    const minX = Math.min(...pts.map((p) => p.x));
    const maxX = Math.max(...pts.map((p) => p.x)) + 214; // + card width
    return { minX, width: Math.max(maxX - minX, 1) };
  }, [banded]);
  const positions = useMemo(
    () => (arrange === "stages" ? banded.positions : layoutObjectGraph(visible.nodes, visible.edges, placed)),
    [arrange, banded, visible, placed],
  );
  const nodes = useMemo(
    () => layoutNodes(visible.nodes, positions, highlightedNodes, weakestNodeId, onIdeateObject, ideatingNodeId, ideatingTarget, selectedId),
    [visible, positions, highlightedNodes, weakestNodeId, onIdeateObject, ideatingNodeId, ideatingTarget, selectedId],
  );
  const edges = useMemo(() => {
    // In Stages mode the card's column already carries the structure, so the full causal web is just
    // noise — draw only the strongest-path spine through the bands. Flow mode keeps every edge.
    const src = arrange === "stages" ? visible.edges.filter((e) => highlightedEdges.has(e.id)) : visible.edges;
    return layoutEdges(src, highlightedEdges);
  }, [arrange, visible, highlightedEdges]);

  // Reorganize: clear founder placements so the whole graph snaps back to the ordered left→right
  // pass, and persist that fresh layout so the tidy sticks across reloads (the server merge overwrites
  // each node's saved position with the dagre one).
  const reorganize = useCallback(() => {
    setPlaced({});
    setRefitSignal((s) => s + 1);
    if (!projectId) return;
    const fresh = layoutObjectGraph(visible.nodes, visible.edges, {});
    void saveObjectGraphPositions(projectId, fresh);
  }, [projectId, visible]);
  // The single emitter of the selected card's face: whenever a card is selected (by a click, a Related
  // re-target, or a fresh graph load), hand its full detail up so the composer BECOMES that card. A
  // prop callback in an effect (not a local setState), so it's lint-clean and can't loop — the emit
  // lands subjectId back on the same id, which the reconciler above absorbs without re-selecting. Also
  // re-runs when the graph reloads, so an edited card keeps the composer's face fresh. Deselects emit
  // null through their own paths (onPaneClick / Esc / the reconciler above).
  useEffect(() => {
    if (!view || selectedId === null) return;
    const node = view.graph.nodes.find((n) => n.id === selectedId);
    if (node) onSubjectChange?.({ id: node.id, label: node.statement, kind: node.type ?? "block", detail: computeCardDetail(node, view) });
  }, [selectedId, view, onSubjectChange]);
  // Esc closes the card face (empty-canvas click already does, via onPaneClick). The card keeps nothing
  // open, and the composer detaches so it never claims to edit a card no longer in focus.
  useEffect(() => {
    if (!selectedId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setSelectedId(null); onSubjectChange?.(null); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, onSubjectChange]);

  // Drag-to-create: the react-flow instance (captured on init) turns the drop's screen point into a graph
  // coordinate; the drop posts one add_node op for a fresh loose card, then selects it and docks the
  // composer so the founder can tell Claude what the block should be. Nothing outward happens.
  const rfRef = useRef<ReactFlowInstance<Node<CardData>, Edge> | null>(null);
  const onCanvasDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes(PALETTE_DRAG_MIME)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }, []);
  const onCanvasDrop = useCallback(async (event: DragEvent<HTMLDivElement>) => {
    const type = event.dataTransfer.getData(PALETTE_DRAG_MIME);
    if (!type || !projectId) return;
    event.preventDefault();
    const point = rfRef.current?.screenToFlowPosition({ x: event.clientX, y: event.clientY }) ?? { x: 0, y: 0 };
    const pos = { x: Math.round(point.x), y: Math.round(point.y) };
    const id = `obj-founder-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const statement = `New ${(PALETTE_BLOCK_LABEL[type] ?? "block").toLowerCase()}`;
    try {
      await applyObjectGraphOperations(projectId, [
        { type: "add_node", node: { id, type, maturity: "loose", statement, origin: "founder" } },
      ]);
      // Land the card where the founder let go: persist the drop point and switch to the free Flow
      // arrangement so it stays under the cursor instead of snapping into a Stages column.
      await saveObjectGraphPositions(projectId, { [id]: pos });
      setPlaced((prev) => ({ ...prev, [id]: pos }));
      setArrange("flow");
      await load();
      setSelectedId(id);
      // A freshly dropped card has no evidence, relations, or weakness yet — emit a minimal face so the
      // composer still docks to it as a card (gray = an unproven draft) rather than falling back to the
      // lightweight header. Its detail fills in the moment the founder gives it substance and it reloads.
      onSubjectChange?.({
        id, label: statement, kind: type,
        detail: { id, statement, type, maturity: "loose", tone: "gray", evidenceLabel: "unsupported", receipts: [], related: [], weakness: null },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [projectId, load, onSubjectChange]);

  const compile = useCallback(async () => {
    if (!projectId || !highlightedPath) return;
    setCompileState({ status: "running", message: "Staging this move for your review." });
    try {
      const result = await compileObjectGraphPath(projectId, { pathId: highlightedPath.pathId });
      const weakness = result.measurementWeakness && typeof result.measurementWeakness === "object"
        ? " Measurement needs repair before this move is easy to judge."
        : "";
      setCompileState({ status: "done", message: `Staged and waiting for your approval — nothing sends until you approve.${weakness}` });
      // Bloom the staged run's gate so the founder can decide it in place — the approve action releases
      // it through the engine, staging locally. Nothing sends until they approve here.
      setRunGate(result.gate ?? null);
      void load();
    } catch (err) {
      setCompileState({ status: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }, [projectId, highlightedPath, load]);

  // Release the staged compiled run: the founder's per-item decisions hit the approve route, which runs
  // the exact reviewed items through the gate to the execute node (staged locally, never sent). On a
  // fully-resolved run the gate closes; if items remain undecided the refreshed gate stays open.
  const approveRunItems = useCallback(async (decisions: Record<string, GateDecision>) => {
    if (!projectId || !runGate?.runId) return;
    const resolved = await approveRun(projectId, runGate.runId, decisions);
    if (resolved.gate.awaitingReview > 0) {
      setRunGate(resolved.gate);
    } else {
      setRunGate(null);
      setCompileState({ status: "done", message: "Released — approved items staged locally. Nothing was sent." });
    }
    void load();
  }, [projectId, runGate, load]);

  const runGateItems = useMemo<GTMItem[]>(() => (runGate?.items ?? []).map((entry) => entry.item), [runGate]);

  const softCount = view?.graph.nodes.filter((node) => primaryWeakness(node)).length ?? 0;
  const grounded = highlightedPath
    ? Math.round((highlightedPath.signals.evidenceStrength ?? 0) * Math.max(highlightedPath.nodeIds.length, 1))
    : 0;

  if (!projectId) {
    return <div className="object-graph-empty">Open a product to build the GTM graph.</div>;
  }

  return (
    <div className={`object-graph-shell lens-${lens} arrange-${arrange} ${highlightedPath ? "has-path" : ""} ${cardsIn ? "cards-in" : ""} ${ignited ? "path-ignited" : ""} ${compact ? "zoomed-out" : ""} ${gatePending ? "gate-pending" : ""}`}>
      <div className="object-path-header">
        <div>
          <div className="object-path-kicker">
            <ShieldCheck aria-hidden="true" />
            Strongest testable path
          </div>
          <strong>{highlightedPath ? (highlightedPath.name || pathHeadline(highlightedPath, view)) : "No testable path yet"}</strong>
          <span>
            {highlightedPath
              ? `grounded ${grounded}/${highlightedPath.nodeIds.length} · weakest link: ${weakestNodeId ? `“${nodeStatement(view, weakestNodeId)}”` : "none found"}`
              : view?.recommendation.reason ?? "Spray the product and market picture to light a path."}
          </span>
        </div>
        <div className="object-path-actions">
          {modeControlled ? null : (
            <div className="arrange-toggle" role="group" aria-label="Arrange the map">
              <button type="button" className={arrange === "stages" ? "active" : ""} onClick={() => { setArrange("stages"); setRefitSignal((s) => s + 1); }}>Why this move</button>
              <button type="button" className={arrange === "flow" ? "active" : ""} onClick={() => { setArrange("flow"); setRefitSignal((s) => s + 1); }}>Flow</button>
            </div>
          )}
          <button type="button" className={lens === "default" ? "active" : ""} onClick={() => setLens("default")}>Default</button>
          <button type="button" className={lens === "weakness" ? "active" : ""} onClick={() => setLens("weakness")}>
            Weakness · {softCount}
          </button>
          {arrange === "flow" ? (
            <button type="button" className="reorganize" onClick={reorganize} disabled={!nodes.length}>
              <Network aria-hidden="true" />
              Reorganize
            </button>
          ) : null}
          <button type="button" className="compile" onClick={() => void compile()} disabled={!highlightedPath || compileState.status === "running"}>
            {compileState.status === "running" ? <FileSearch aria-hidden="true" /> : <Play aria-hidden="true" />}
            Stage this move
          </button>
        </div>
      </div>

      <ObjectGraphPalette
        collapsed={paletteCollapsed}
        onToggle={(next) => { setPaletteCollapsed(next); setRefitSignal((s) => s + 1); }}
      />

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.12}
        maxZoom={1.4}
        onInit={(instance) => { rfRef.current = instance; }}
        onDrop={onCanvasDrop}
        onDragOver={onCanvasDragOver}
        nodesDraggable={arrange === "flow"}
        nodesConnectable={false}
        elementsSelectable
        // A selected node must not leap above the path header and bleed over it — keep every node in the
        // same stacking plane, under the header.
        elevateNodesOnSelect={false}
        onNodeClick={(_, node) => {
          // Select it; the emit-detail effect above docks the composer to it (its full card face), so the
          // composer BECOMES that card and the next message resolves to it.
          setSelectedId(node.id);
        }}
        onNodeDragStop={(_, node) => {
          const pos = { x: Math.round(node.position.x), y: Math.round(node.position.y) };
          setPlaced((prev) => ({ ...prev, [node.id]: pos }));
          if (projectId) void saveObjectGraphPositions(projectId, { [node.id]: pos });
        }}
        onPaneClick={() => { setSelectedId(null); onSubjectChange?.(null); finishReveal(); }}
      >
        <Background color="var(--canvas-dot)" gap={22} size={1} />
        <Controls showInteractive={false} />
        {arrange === "stages"
          ? <StagesFit bounds={stagesBounds} ready={Boolean(view && nodes.length)} refitSignal={refitSignal} leftInset={paletteInset} />
          : <FitOnLoad ready={Boolean(view && nodes.length)} refitSignal={refitSignal} leftInset={paletteInset} />}
        <ZoomWatch onZoom={onZoomCompact} />
        {arrange === "stages" ? <BandHeaders cols={banded.cols} /> : null}
      </ReactFlow>

      {loading ? <div className="object-graph-status">Reading the graph…</div> : null}
      {error ? <div className="object-graph-status error">{error}</div> : null}
      {compileState.status !== "idle" ? (
        <div className={`object-graph-status ${compileState.status}`}>
          {compileState.status === "done" ? <CheckCircle2 aria-hidden="true" /> : null}
          {compileState.message}
        </div>
      ) : null}

      {/* The card face used to live here as a separate right-dock inspector. It now folds into the top
          of the composer (see ComposerDock's card face): selecting a card hands its full detail up via
          onSubjectChange, and the composer BECOMES that card. Only the selection ring stays on the
          canvas. */}

      {gate && gatePending ? (
        <aside className="object-gate-bloom">
          <div className="object-gate-bloom-head">
            <Shield aria-hidden="true" />
            <div>
              <strong>Your review</strong>
              <span>{gate.items.length} staged · nothing leaves until you approve</span>
            </div>
          </div>
          <GateReview
            items={gate.items}
            learned={gate.learned}
            offer={gate.offer}
            promote={gate.promote}
            onSubmit={(decisions) => gate.onSubmitReview(gate.gateNodeId, decisions)}
            onRecordOutcome={
              projectId
                ? async (item, outcome) => {
                    await recordOutcome(projectId, {
                      joinKey: String((item as { joinKey?: unknown }).joinKey ?? ""),
                      outcomeKind: outcome.outcomeKind,
                      value: outcome.value,
                    });
                  }
                : undefined
            }
          />
        </aside>
      ) : null}

      {/* The staged compiled run's own gate — blooms after "Compile run" and, unlike the operator gate
          above, releases through the approve route (staging locally, never sending). Shown only when the
          operator gate isn't already up, so the two never fight for the same corner. */}
      {runGate && runGateItems.length > 0 && !(gate && gatePending) ? (
        <aside className="object-gate-bloom">
          <div className="object-gate-bloom-head">
            <Shield aria-hidden="true" />
            <div>
              <strong>Your review</strong>
              <span>{runGate.awaitingReview} staged · nothing leaves until you approve</span>
            </div>
          </div>
          <GateReview
            items={runGateItems}
            learned={0}
            onSubmit={approveRunItems}
            onRecordOutcome={
              projectId
                ? async (item, outcome) => {
                    await recordOutcome(projectId, {
                      joinKey: String((item as { joinKey?: unknown }).joinKey ?? ""),
                      outcomeKind: outcome.outcomeKind,
                      value: outcome.value,
                    });
                  }
                : undefined
            }
          />
        </aside>
      ) : null}
    </div>
  );
}

function nodeStatement(view: ObjectGraphView | null | undefined, id: string) {
  return view?.graph.nodes.find((node) => node.id === id)?.statement ?? id;
}

function pathHeadline(path: ObjectGraphPathRecommendation, view: ObjectGraphView | null) {
  const firstStrategy = path.nodeIds
    .map((id) => view?.graph.nodes.find((node) => node.id === id))
    .find((node) => node?.domain === "runs" || node?.domain === "strategy");
  return firstStrategy?.statement ?? "Highlighted path";
}
