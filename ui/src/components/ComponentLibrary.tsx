import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine, Bot, Code2, FlaskConical, Plug, Quote, Search, ShieldCheck,
  Target, TrendingUp, Users, Wand2, X,
} from "lucide-react";
import type {
  ChannelMeta, Claim, GtmLibrary, GTMGraph, GTMNode, GtmExperiment, Person,
} from "@/types";
import { agentPersona, FAMILY_TINT, type AgentFamily } from "@/lib/agentPersona";

// ComponentLibrary — the Figma-style component picker that opens from the Claude co-pilot dock. The
// founder hand-picks REAL inventory — their leads, the teammates they've composed, the ICP/claims/
// experiments they've stated, and the raw building blocks — and clicking a row drops it on the canvas
// as a node. Nothing is fabricated: every row is read from live client state, and empty groups are
// omitted rather than shown as a fake placeholder row.
//
// Insertion reuses the SAME typed graph-mutation path the "+ Add step" picker uses (onInsertNode →
// App.handleAddNode → applyOperations). No new backend door: a picked item is just a node spec.
//   · Your data (people) → a Source node whose config.items IS the seeded leads (the manual find
//     connector reads config.items, so the seed is genuinely executable, not decorative).
//   · Teammate         → an agent node (kind "agent", the composed role).
//   · Reference        → a floating context node carrying the ICP / claim / experiment.
//   · Block            → a raw node of that kind for the founder to configure in the node editor.
//
// Presentational: it owns only its own UI state (the search query, the keyboard highlight). All data
// and the insert callback arrive via props. The panel chrome is frosted glass over the light canvas;
// the ROWS stay opaque so the content you read never bleeds through (the founder's explicit call).

type NodeSpec = Partial<GTMNode> & { label: string };

// One addable row. `insert` is a closure over the real spec so the list render stays declarative and
// the keyboard handler can fire the highlighted row's insert without re-deriving it.
type LibItem = {
  key: string;
  name: string;
  desc: string;
  // A teammate row shows a family-tinted monogram tile instead of a lucide glyph.
  monogram?: { text: string; family: AgentFamily };
  icon?: React.ReactNode;
  spec: NodeSpec;
};

type LibGroup = { id: string; label: string; note?: string; items: LibItem[] };

// Turn a durable Person into a manual-source item. The manual find connector spreads each entry and
// keys it by id/email/url (see connectors/find/manual.mjs), so these become real prospect items — the
// leads are BOUND to the node, not just counted on its face.
function personToItem(p: Person): Record<string, unknown> {
  return {
    id: p.id,
    name: p.name ?? undefined,
    org: p.org ?? undefined,
    handle: p.handle ?? undefined,
    email: p.email ?? undefined,
    domain: p.domain ?? undefined,
  };
}

// An ICP object is "real" only when the founder actually filled something in — an empty {} is not a
// reference worth inserting, so the whole References group can honestly omit it.
function icpSummary(icp: Record<string, unknown>): string | null {
  const parts = Object.entries(icp)
    .filter(([, v]) => v != null && v !== "" && !(Array.isArray(v) && v.length === 0))
    .map(([k, v]) => (Array.isArray(v) ? `${k}: ${v.join(", ")}` : `${k}: ${String(v)}`));
  return parts.length ? parts.join(" · ") : null;
}

function Mark({ item }: { item: LibItem }) {
  if (item.monogram) {
    const tint = FAMILY_TINT[item.monogram.family];
    return (
      <span className="clib-mark mono" style={{ background: tint.bg, color: tint.fg }}>
        {item.monogram.text}
      </span>
    );
  }
  return <span className="clib-mark">{item.icon ?? <Bot size={15} />}</span>;
}

export function ComponentLibrary({
  open, onClose,
  people, channels, channelGraphs, graph, library,
  icp, claims, experiments,
  onInsertNode,
}: {
  open: boolean;
  onClose: () => void;
  // Real client state — the inventory. Nothing here is fetched or invented by this component.
  people: Person[];
  channels: ChannelMeta[];
  channelGraphs: Map<string, GTMGraph>;
  // The active pipeline the inserts land on (also a source of composed teammates).
  graph: GTMGraph | null;
  // The on-disk agent registry — the fallback teammate source when no agent has been composed yet.
  library: GtmLibrary | null;
  icp: Record<string, unknown>;
  claims: Claim[];
  experiments: GtmExperiment[];
  // The ONE insertion door — App.handleAddNode, the same typed graph mutation the "+" picker uses.
  onInsertNode: (spec: NodeSpec) => void;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  // A brief per-row "Added" confirmation, so hand-picking several in a row (the Figma gesture) reads as
  // progress instead of a silent click. Keyed by item key; cleared on a timer.
  const [justAdded, setJustAdded] = useState<string | null>(null);

  // ── Your data — the headline row. The founder's durable people/leads, seeded into one Source node.
  const dataGroup: LibGroup | null = useMemo(() => {
    if (people.length === 0) return null;
    const items = people.map(personToItem);
    const noun = people.length === 1 ? "person" : "people";
    return {
      id: "data",
      label: "Your data",
      items: [{
        key: "data:people",
        name: `Your ${people.length} ${noun}`,
        desc: "Everyone you've found, seeded into one Source node",
        icon: <Users size={15} />,
        spec: {
          label: `Your ${people.length} ${noun}`,
          category: "source",
          connector: "manual",
          config: { items, seededPeopleIds: people.map((p) => p.id), seededCount: people.length },
          contract: { emits: [] },
        },
      }],
    };
  }, [people]);

  // ── Teammates — the agents you've actually composed, deduped across every pipeline (the truest read
  // of "what agents we have"). Falls back to the on-disk registry only when no agent is on any canvas.
  const teammateGroup: LibGroup | null = useMemo(() => {
    const byRef = new Map<string, { ref: string; label: string }>();
    const collect = (g: GTMGraph | null | undefined) => {
      for (const n of g?.nodes ?? []) {
        if (n.kind === "agent") {
          const ref = n.ref || n.label;
          if (ref && !byRef.has(ref)) byRef.set(ref, { ref, label: n.label });
        }
      }
    };
    collect(graph);
    for (const g of channelGraphs.values()) collect(g);

    let source: { ref: string; label: string; job?: string }[] = [...byRef.values()];
    // Nothing composed yet → the on-disk registry is the honest fallback (still real inventory).
    if (source.length === 0 && library?.agents?.length) {
      source = library.agents.map((a) => ({ ref: a.ref, label: a.ref, job: a.description }));
    }
    if (source.length === 0) return null;

    return {
      id: "teammates",
      label: "Teammates",
      items: source.map((a) => {
        const persona = agentPersona(a.ref, a.job);
        return {
          key: `agent:${a.ref}`,
          name: persona.role,
          desc: a.job || a.ref,
          monogram: { text: persona.monogram, family: persona.family },
          spec: {
            label: persona.role, kind: "agent", category: "generate", ref: a.ref,
            contract: { accepts: [], emits: [] },
          },
        };
      }),
    };
  }, [graph, channelGraphs, library]);

  // ── References — the shared objects you've stated: the ICP, the claims, the experiments. Each drops
  // as a floating context node carrying the object, so downstream steps can read it.
  const referenceGroup: LibGroup | null = useMemo(() => {
    const items: LibItem[] = [];
    const icpText = icpSummary(icp);
    if (icpText) {
      items.push({
        key: "ref:icp",
        name: "Your ICP",
        desc: icpText,
        icon: <Target size={15} />,
        spec: {
          label: "ICP", category: "context", connector: "manual",
          config: { referenceKind: "icp", icp }, contract: {},
        },
      });
    }
    for (const c of claims) {
      items.push({
        key: `ref:claim:${c.id}`,
        name: c.text.length > 48 ? `${c.text.slice(0, 47)}…` : c.text,
        desc: `Claim · ${c.provenance}`,
        icon: <Quote size={15} />,
        spec: {
          label: c.text.length > 32 ? `${c.text.slice(0, 31)}…` : c.text,
          category: "context", connector: "manual",
          config: { referenceKind: "claim", claimId: c.id, text: c.text }, contract: {},
        },
      });
    }
    for (const e of experiments) {
      const label = e.hypothesis || e.variable || `Experiment ${e.id.slice(0, 6)}`;
      items.push({
        key: `ref:exp:${e.id}`,
        name: label.length > 48 ? `${label.slice(0, 47)}…` : label,
        desc: `Experiment${e.status ? ` · ${e.status}` : ""}`,
        icon: <FlaskConical size={15} />,
        spec: {
          label: label.length > 32 ? `${label.slice(0, 31)}…` : label,
          category: "context", connector: "manual",
          config: { referenceKind: "experiment", experimentId: e.id }, contract: {},
        },
      });
    }
    return items.length ? { id: "references", label: "References", items } : null;
  }, [icp, claims, experiments]);

  // ── Blocks — the raw building-block kinds, always available. Each inserts an unconfigured node of
  // that kind for the founder to set up in the node editor (honest: it's a real node, not a stub).
  const blockGroup: LibGroup = useMemo(() => ({
    id: "blocks",
    label: "Blocks",
    note: "Raw building blocks",
    items: [
      {
        key: "block:source", name: "Source", desc: "Rows, a file, or an API",
        icon: <ArrowDownToLine size={15} />,
        spec: { label: "Source", category: "source", connector: "manual", config: { items: [] }, contract: { emits: [] } },
      },
      {
        key: "block:code", name: "Code", desc: "Deterministic transform",
        icon: <Code2 size={15} />,
        spec: { label: "Code step", category: "filter", kind: "code", ref: "transform", config: {}, contract: { accepts: [], emits: [] } },
      },
      {
        key: "block:skill", name: "Skill", desc: "Run a skill on your subscription",
        icon: <Wand2 size={15} />,
        spec: { label: "Skill", category: "generate", kind: "skill", ref: "", config: {}, contract: { accepts: [], emits: [] } },
      },
      {
        key: "block:gate", name: "Gate", desc: "Your review — the wall",
        icon: <ShieldCheck size={15} />,
        spec: { label: "Founder review", category: "gate", connector: "default", config: {}, contract: { accepts: [], emits: ["approved", "gtmActionId"] } },
      },
      {
        key: "block:measure", name: "Measure", desc: "Capture attributable outcomes",
        icon: <TrendingUp size={15} />,
        spec: { label: "Measure outcomes", category: "measure", connector: "default", config: { joinKey: "gtmActionId" }, contract: { accepts: ["gtmActionId", "source"], emits: ["attribution"] } },
      },
      {
        key: "block:mcp", name: "Connector", desc: "An external MCP tool",
        icon: <Plug size={15} />,
        spec: { label: "Connector", category: "enrich", kind: "mcp", ref: "", config: {}, contract: { accepts: [], emits: [] } },
      },
    ],
  }), []);

  // Ordered groups — Your data leads (the headline the founder called out), then who runs it, then what
  // grounds it, then the raw parts. Empty groups are already null and drop out here.
  const groups = useMemo(
    () => [dataGroup, teammateGroup, referenceGroup, blockGroup].filter((g): g is LibGroup => g != null),
    [dataGroup, teammateGroup, referenceGroup, blockGroup],
  );

  // Filter every group by the one search field, then flatten to a single indexed list so ↑/↓/↵ drive
  // the whole picker regardless of which group a row sits in.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map((g) => ({ ...g, items: g.items.filter((it) => it.name.toLowerCase().includes(q) || it.desc.toLowerCase().includes(q)) }))
      .filter((g) => g.items.length > 0);
  }, [groups, query]);

  const flat = useMemo(() => filtered.flatMap((g) => g.items), [filtered]);

  // Reset the filter + highlight whenever the picker is summoned — always opens clean, first row hot.
  const [trackedOpen, setTrackedOpen] = useState(open);
  if (trackedOpen !== open) {
    setTrackedOpen(open);
    if (open) { setQuery(""); setActiveIndex(0); }
  }
  // Keep the highlight in range as the filter narrows.
  if (activeIndex > 0 && activeIndex > flat.length - 1) {
    setActiveIndex(flat.length === 0 ? 0 : flat.length - 1);
  }

  const insert = (item: LibItem) => {
    onInsertNode(item.spec);
    setJustAdded(item.key);
    window.setTimeout(() => setJustAdded((k) => (k === item.key ? null : k)), 1100);
  };

  // Focus the search on open (a DOM call, so it lives in an effect, not render).
  useEffect(() => {
    if (!open) return;
    const id = window.requestAnimationFrame(() => searchRef.current?.focus());
    return () => window.cancelAnimationFrame(id);
  }, [open]);

  // Escape closes; outside-click closes — the expected ways out of a summoned popover.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    const onPointer = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [open, onClose]);

  if (!open) return null;

  const onSearchKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, Math.max(0, flat.length - 1))); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (flat[activeIndex]) insert(flat[activeIndex]); }
  };

  const indexOf = (item: LibItem) => flat.findIndex((r) => r.key === item.key);

  return (
    <div className="clib-panel" ref={panelRef} role="dialog" aria-label="Add a component to the canvas">
      <div className="clib-head">
        <div className="clib-search">
          <Search size={14} className="clib-search-icon" aria-hidden="true" />
          <input
            ref={searchRef}
            className="clib-search-input"
            type="text"
            value={query}
            placeholder="Search your inventory…"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onSearchKey}
            aria-label="Search the component library"
          />
        </div>
        <button className="clib-close" onClick={onClose} type="button" aria-label="Close">
          <X size={15} />
        </button>
      </div>

      <div className="clib-list" role="listbox" aria-label="Components">
        {flat.length === 0 ? (
          <p className="clib-empty">Nothing matches “{query.trim()}”.</p>
        ) : (
          filtered.map((group) => (
            <div className="clib-group" key={group.id}>
              <div className="clib-group-head">
                <span className="clib-group-label">{group.label}</span>
                {group.note ? <span className="clib-group-note">{group.note}</span> : null}
              </div>
              {group.items.map((item) => {
                const idx = indexOf(item);
                const active = idx === activeIndex;
                const added = justAdded === item.key;
                return (
                  <button
                    key={item.key}
                    className={`clib-row${active ? " active" : ""}${added ? " added" : ""}`}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => insert(item)}
                    title={`Insert ${item.name}`}
                  >
                    <Mark item={item} />
                    <span className="clib-row-text">
                      <span className="clib-row-name">{item.name}</span>
                      <span className="clib-row-desc">{item.desc}</span>
                    </span>
                    <span className="clib-row-cue" aria-hidden="true">{added ? "Added" : "Insert"}</span>
                  </button>
                );
              })}
            </div>
          ))
        )}
      </div>

      <div className="clib-foot" aria-hidden="true">
        <kbd className="clib-kbd">↑↓</kbd> select
        <span className="clib-foot-sep">·</span>
        <kbd className="clib-kbd">↵</kbd> insert
        {channels.length ? <span className="clib-foot-target">drops on the current pipeline</span> : null}
      </div>
    </div>
  );
}
