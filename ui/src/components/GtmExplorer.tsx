import { useState } from "react";
import {
  AlertTriangle, ArrowRight, ChevronDown, ChevronRight, ChevronLeft,
  Workflow, Bot, Sparkles, Layers, ListChecks, Plus,
} from "lucide-react";
import type { ChannelMeta, ContextManifest, EngineState, GTMGraph, GtmLibrary } from "@/types";

// The Explorer — the left pane of the IDE shell. It makes the parts of GTM engineering legible
// and answers "where do I start": your channels are the files (primary, top), with the agents,
// skills, and assembled context beneath, and the engine's problems folded in at the bottom.
// Reuses the rail visual idiom (loop-problems-rail) so it sits where the old Problems rail did.

const CONTEXT_ORDER = ["product", "taste", "state", "signal"] as const;

function Section({
  icon, title, count, defaultOpen = false, children,
}: {
  icon: React.ReactNode; title: string; count?: number | string; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="explorer-section">
      <button className="explorer-section-head" onClick={() => setOpen((v) => !v)} type="button">
        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        {icon}
        <span className="explorer-section-title">{title}</span>
        {count !== undefined ? <span className="rail-count">{count}</span> : null}
      </button>
      {open ? <div className="explorer-section-body">{children}</div> : null}
    </div>
  );
}

type ExplorerView = "projects" | "understand" | "opportunities" | "channels" | "canvas";

export function GtmExplorer({
  channels, activeChannelId, currentView, onOpenChannel, onCreateChannel,
  onOpenArtifact, onOpenView, library, contextManifest, engine, graph, onJumpToNode,
}: {
  channels: ChannelMeta[];
  activeChannelId: string | null;
  currentView: ExplorerView;
  onOpenChannel: (id: string) => void;
  onCreateChannel: (name: string, objective: string) => void | Promise<void>;
  onOpenArtifact: (type: "agent" | "skill", ref: string) => void;
  onOpenView: (view: ExplorerView) => void;
  library: GtmLibrary | null;
  contextManifest: ContextManifest | null;
  engine: EngineState | null;
  graph: GTMGraph | null;
  onJumpToNode: (nodeId: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const problems = (graph?.nodes.length === 0) ? [] : engine?.investigations ?? [];
  // Some subsystems (learn) have no node of their own — route to the gate, where founder
  // decisions are recorded, so a problem never dead-ends without a place to act.
  const ROUTE_FALLBACK: Record<string, string> = { learn: "gate" };
  const nodeForSubsystem = (subsystem: string) =>
    graph?.nodes.find((n) => n.category === subsystem)
    ?? (ROUTE_FALLBACK[subsystem] ? graph?.nodes.find((n) => n.category === ROUTE_FALLBACK[subsystem]) : null)
    ?? null;
  // Same health bands as the canvas node badge, so the rail's figure reads identically.
  const healthHex = (health: number) =>
    health < 50 ? "#dc2626" : health < 70 ? "#d97706" : health < 85 ? "#ca8a04" : "#16a34a";
  const ctxByName = new Map((contextManifest?.providers ?? []).map((p) => [p.name, p] as const));

  if (collapsed) {
    return (
      <aside className="loop-problems-rail collapsed">
        <button className="rail-reopen" onClick={() => setCollapsed(false)} type="button" title="Show explorer">
          <ChevronRight />
        </button>
      </aside>
    );
  }

  return (
    <aside className="loop-problems-rail">
      <div className="rail-header">
        <div className="rail-title"><Workflow size={15} /><span>Explorer</span></div>
        <button className="rail-collapse" onClick={() => setCollapsed(true)} type="button" title="Collapse">
          <ChevronLeft />
        </button>
      </div>

      {/* Channels — the primary object. Your files. */}
      <Section icon={<Workflow size={13} />} title="Channels" count={channels.length} defaultOpen>
        {channels.length === 0 ? (
          <p className="explorer-empty">No channels yet. Ideate one to start.</p>
        ) : channels.map((ch) => (
          <button
            key={ch.id}
            className={`explorer-row ${ch.id === activeChannelId ? "active" : ""}`}
            onClick={() => onOpenChannel(ch.id)}
            type="button"
          >
            <span
              className="explorer-dot"
              style={{ background: ch.pendingGates > 0 ? "var(--gap)" : ch.lastRunOk === false ? "var(--danger)" : ch.runCount > 0 ? "var(--proven)" : "var(--ghost)" }}
            />
            <span className="explorer-row-name">{ch.name}</span>
            <span className="explorer-row-meta">
              {ch.pendingGates > 0 ? `${ch.pendingGates} gate` : ch.runCount > 0 ? `${ch.runCount} run${ch.runCount !== 1 ? "s" : ""}` : "—"}
            </span>
          </button>
        ))}
        {creating ? (
          <form
            className="explorer-create"
            onSubmit={async (e) => {
              e.preventDefault();
              const name = newName.trim();
              if (!name) return;
              await onCreateChannel(name, "");
              setNewName(""); setCreating(false);
            }}
          >
            <input
              autoFocus aria-label="New channel name" placeholder="Channel name…"
              value={newName} onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Escape") { setCreating(false); setNewName(""); } }}
            />
          </form>
        ) : (
          <button className="explorer-row explorer-new" onClick={() => setCreating(true)} type="button">
            <Plus size={13} /><span className="explorer-row-name">New channel</span>
          </button>
        )}
        <button
          className={`explorer-row explorer-new ${currentView === "opportunities" ? "active" : ""}`}
          onClick={() => onOpenView("opportunities")}
          type="button"
        >
          <Sparkles size={13} /><span className="explorer-row-name">Ideate channels</span>
        </button>
      </Section>

      {/* Agents — real subagents on disk. Click opens the definition to read/edit. */}
      <Section icon={<Bot size={13} />} title="Agents" count={library?.agents.length ?? 0}>
        {(library?.agents ?? []).map((a) => (
          <button key={a.ref} className="explorer-row" onClick={() => onOpenArtifact("agent", a.ref)} type="button" title={a.description}>
            <span className="explorer-row-name">{a.ref}</span>
          </button>
        ))}
      </Section>

      {/* Skills — real skills on disk. Click opens the definition to read/edit. */}
      <Section icon={<Sparkles size={13} />} title="Skills" count={library?.skills.length ?? 0}>
        {(library?.skills ?? []).map((s) => (
          <button key={s.name} className="explorer-row" onClick={() => onOpenArtifact("skill", s.name)} type="button" title={s.description}>
            <span className="explorer-row-name">{s.name}</span>
          </button>
        ))}
      </Section>

      {/* Context — the assembled substrate, the multiplier. Opens the grounding deep-dive. */}
      <Section
        icon={<Layers size={13} />}
        title="Context"
        count={`${contextManifest?.contributingProviders ?? 0}/4`}
        defaultOpen
      >
        {CONTEXT_ORDER.map((name) => {
          const p = ctxByName.get(name);
          const chars = p?.chars ?? 0;
          // The product layer opens the grounding view; the rest are informational signals.
          const opensGrounding = name === "product";
          const className = `explorer-row ${opensGrounding ? "" : "static"} ${opensGrounding && currentView === "understand" ? "active" : ""}`;
          const content = (
            <>
              <span className="explorer-row-name">{name}</span>
              <span className="explorer-row-meta">{chars > 0 ? `${chars} ch` : "—"}</span>
            </>
          );
          return opensGrounding ? (
            <button key={name} className={className} onClick={() => onOpenView("understand")} type="button" title="Open product grounding">
              {content}
            </button>
          ) : (
            <div key={name} className={className} style={{ opacity: chars > 0 ? 1 : 0.5 }}>{content}</div>
          );
        })}
      </Section>

      {/* Problems — the engine, folded in. */}
      <Section icon={<ListChecks size={13} />} title="Problems" count={problems.length} defaultOpen={problems.length > 0}>
        {problems.length === 0 ? (
          <p className="explorer-empty">No problems detected.</p>
        ) : problems.map((p) => {
          const node = nodeForSubsystem(p.subsystem);
          return (
            <div className="rail-item" key={p.id}>
              <div className="rail-item-head">
                <AlertTriangle />
                <span className="rail-item-sub">{p.subsystem}</span>
                <span
                  className="rail-item-health"
                  style={{ color: healthHex(p.health), borderColor: healthHex(p.health) }}
                  title={`Health ${p.health}`}
                >
                  {p.health}
                </span>
              </div>
              <p className="rail-item-problem">{p.problem}</p>
              {node ? (
                <button className="rail-item-fix" onClick={() => onJumpToNode(node.id)} type="button">
                  Fix in {node.label}<ArrowRight />
                </button>
              ) : null}
            </div>
          );
        })}
      </Section>
    </aside>
  );
}
