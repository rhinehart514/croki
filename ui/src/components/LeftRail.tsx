import { useMemo, useState, type DragEvent } from "react";
import {
  Workflow, Users, Wrench, Plus, ChevronDown, Shapes,
  PanelLeftClose, PanelLeftOpen, Check,
} from "lucide-react";
import { agentPersona, humanizeRef, FAMILY_TINT } from "@/lib/agentPersona";
import { healthHex } from "@/lib/health";
import { kindIcon } from "@/lib/objectKindIcons";
import { PALETTE_BLOCK_LABEL, PALETTE_DRAG_MIME, PALETTE_FAMILIES, STEP_DRAG_MIME } from "@/lib/objectPalette";
import type { AgentBenchRow } from "@/api";
import type { ChannelMeta, GtmLibrary } from "@/types";
import "@/styles/left-rail.css";

// The founder's "your stuff" rail — one always-present, opaque left column that folds the old bench
// overlay, the workspace's pipeline list, AND the floating block palette into a single index alongside
// the canvas. Four sections: Pipelines (real project state, click to load on the canvas), Blocks (the
// belief building blocks — drag one onto the strategy map to add it), Crew (every agent and what it has
// earned at the gate — click for its profile, drag it onto the canvas to add it as a pipeline step),
// and Skills (the on-disk judgment — click to edit, drag to add as a pipeline step).
// Dragging behaves by TYPE, and the two object models never cross: a Block drop builds the strategy
// map; a Crew or Skill drop builds the pipeline workflow. It sits BESIDE the canvas, never over it, and
// collapses to a thin strip to hand the width back.

// The round identity mark, derived from the persona library — same source the profile sheet reads.
function Mark({ agentRef, job }: { agentRef: string; job?: string }) {
  const { family, monogram } = agentPersona(agentRef, job);
  const tint = FAMILY_TINT[family];
  return <span className="lr-mark" style={{ background: tint.bg, color: tint.fg }}>{monogram}</span>;
}

function Section({
  icon, title, count, onNew, newTitle, children,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  onNew?: () => void;
  newTitle?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <section className={`lr-section ${open ? "" : "closed"}`}>
      <div className="lr-shead">
        <button className="lr-shead-toggle" type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          <ChevronDown className="lr-shead-chev" size={13} />
          <span className="lr-shead-icon">{icon}</span>
          <span className="lr-shead-title">{title}</span>
          <span className="lr-shead-count">{count}</span>
        </button>
        {onNew ? (
          <button className="lr-shead-new" type="button" onClick={onNew} title={newTitle}>
            <Plus size={13} />
          </button>
        ) : null}
      </div>
      {open ? <div className="lr-slist">{children}</div> : null}
    </section>
  );
}

export function LeftRail({
  channels,
  activeChannelId,
  bench,
  library,
  onLoadChannel,
  onNewChannel,
  onOpenAgent,
  onOpenSkill,
  onNewSkill,
}: {
  channels: ChannelMeta[];
  activeChannelId: string | null;
  bench: AgentBenchRow[] | null;
  library: GtmLibrary | null;
  onLoadChannel: (id: string) => void;
  onNewChannel: () => void;
  onOpenAgent: (ref: string) => void;
  onOpenSkill: (name: string) => void;
  onNewSkill: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const skills = library?.skills ?? [];
  const blockCount = useMemo(() => PALETTE_FAMILIES.reduce((total, family) => total + family.blocks.length, 0), []);

  // Drag a belief block → the strategy/object map reads PALETTE_DRAG_MIME and creates a belief card
  // (exactly the old floating palette's contract, so the existing canvas drop still fires).
  const onBlockDragStart = (event: DragEvent<HTMLElement>, type: string) => {
    event.dataTransfer.setData(PALETTE_DRAG_MIME, type);
    event.dataTransfer.effectAllowed = "copy";
  };

  // Drag a Crew member or a Skill → the canvas-area drop target reads STEP_DRAG_MIME and adds a pipeline
  // step (never a belief), switching to the build view so the founder watches it land.
  const onStepDragStart = (
    event: DragEvent<HTMLElement>,
    payload: { kind: "agent" | "skill"; ref: string; label: string },
  ) => {
    event.dataTransfer.setData(STEP_DRAG_MIME, JSON.stringify(payload));
    event.dataTransfer.effectAllowed = "copy";
  };

  // Split the roster the way the bench did — proven above still-on-the-bench — so the founder reads
  // "who's earned it" first. Names fall back to the descriptive ref when a coarse role would collide.
  const { proven, waiting, nameByRef } = useMemo(() => {
    const list = bench ?? [];
    const roleCount = new Map<string, number>();
    for (const r of list) {
      const { role } = agentPersona(r.ref, r.job);
      roleCount.set(role, (roleCount.get(role) ?? 0) + 1);
    }
    const nameByRef = new Map<string, string>();
    for (const r of list) {
      const { role } = agentPersona(r.ref, r.job);
      nameByRef.set(r.ref, (roleCount.get(role) ?? 0) > 1 ? humanizeRef(r.ref) : role);
    }
    return {
      proven: list.filter((r) => r.hasRuns),
      waiting: list.filter((r) => !r.hasRuns),
      nameByRef,
    };
  }, [bench]);

  if (collapsed) {
    return (
      <aside className="left-rail collapsed" aria-label="Your stuff">
        <button className="lr-expand" type="button" onClick={() => setCollapsed(false)} title="Expand your stuff">
          <PanelLeftOpen size={16} />
        </button>
      </aside>
    );
  }

  return (
    <aside className="left-rail" aria-label="Your stuff">
      <header className="lr-head">
        <span className="lr-head-title">Your stuff</span>
        <button className="lr-collapse" type="button" onClick={() => setCollapsed(true)} title="Collapse — reclaim the width">
          <PanelLeftClose size={15} />
        </button>
      </header>

      <div className="lr-body">
        {/* Pipelines — real project state; click loads it onto the canvas. */}
        <Section
          icon={<Workflow size={13} />}
          title="Pipelines"
          count={channels.length}
          onNew={onNewChannel}
          newTitle="Ideate a new pipeline"
        >
          {channels.length === 0 ? (
            <p className="lr-empty">No pipelines yet.</p>
          ) : (
            channels.map((ch) => (
              <button
                key={ch.id}
                className={`lr-row ${ch.id === activeChannelId ? "active" : ""}`}
                type="button"
                onClick={() => onLoadChannel(ch.id)}
                title={ch.objective || ch.name}
              >
                <span
                  className="lr-dot"
                  style={{ background: healthHex(ch.lastRunOk === false ? 0.3 : ch.lastRunOk ? 0.85 : 0.6) }}
                />
                <span className="lr-row-main">
                  <span className="lr-row-name">{ch.name}</span>
                  <span className="lr-row-meta">
                    {ch.pendingGates > 0 ? `${ch.pendingGates} at the gate` : ch.runCount > 0 ? `${ch.runCount} run${ch.runCount === 1 ? "" : "s"}` : "never run"}
                  </span>
                </span>
              </button>
            ))
          )}
        </Section>

        {/* Blocks — the belief building blocks; drag one onto the strategy map to add it. Grouped under
            the plain-English families a founder tells a market story in. */}
        <Section icon={<Shapes size={13} />} title="Blocks" count={blockCount}>
          {PALETTE_FAMILIES.map((family) => (
            <div key={family.label}>
              <div className="lr-group">{family.label}</div>
              {family.blocks.map((type) => {
                const Glyph = kindIcon(type);
                return (
                  <div
                    key={type}
                    className="lr-block"
                    draggable
                    onDragStart={(event) => onBlockDragStart(event, type)}
                    title={`Drag onto the map to add a ${PALETTE_BLOCK_LABEL[type].toLowerCase()}`}
                  >
                    <Glyph size={14} aria-hidden="true" />
                    <span className="lr-block-name">{PALETTE_BLOCK_LABEL[type]}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </Section>

        {/* Crew — every agent and what it earned at the gate; click opens its profile, drag adds it as a
            pipeline step. */}
        <Section icon={<Users size={13} />} title="Crew" count={(bench ?? []).length}>
          {bench === null ? (
            <p className="lr-empty">Reading the roster…</p>
          ) : bench.length === 0 ? (
            <p className="lr-empty">No agents yet.</p>
          ) : (
            <>
              {proven.length > 0 ? <div className="lr-group">Proven</div> : null}
              {proven.map((row) => (
                <CrewRow key={row.ref} row={row} name={nameByRef.get(row.ref)} onOpen={onOpenAgent} onDragStep={onStepDragStart} />
              ))}
              {waiting.length > 0 ? <div className="lr-group">On the bench</div> : null}
              {waiting.map((row) => (
                <CrewRow key={row.ref} row={row} name={nameByRef.get(row.ref)} onOpen={onOpenAgent} onDragStep={onStepDragStart} />
              ))}
            </>
          )}
        </Section>

        {/* Skills — the on-disk judgment; click opens the markdown editor. */}
        <Section
          icon={<Wrench size={13} />}
          title="Skills"
          count={skills.length}
          onNew={onNewSkill}
          newTitle="Author a new skill"
        >
          {skills.length === 0 ? (
            <p className="lr-empty">No skills yet.</p>
          ) : (
            skills.map((sk) => (
              <button
                key={sk.name}
                className="lr-row lr-draggable"
                type="button"
                draggable
                onDragStart={(event) => onStepDragStart(event, { kind: "skill", ref: sk.name, label: sk.name })}
                onClick={() => onOpenSkill(sk.name)}
                title={sk.description || sk.name}
              >
                <span className="lr-row-main">
                  <span className="lr-row-name">{sk.name}</span>
                  {sk.description ? <span className="lr-row-meta">{sk.description}</span> : null}
                </span>
              </button>
            ))
          )}
        </Section>
      </div>
    </aside>
  );
}

function CrewRow({
  row, name, onOpen, onDragStep,
}: {
  row: AgentBenchRow;
  name?: string;
  onOpen: (ref: string) => void;
  onDragStep: (event: DragEvent<HTMLElement>, payload: { kind: "agent" | "skill"; ref: string; label: string }) => void;
}) {
  const { role } = agentPersona(row.ref, row.job);
  const decided = row.counts.approved + row.counts.rejected;
  const pct = decided > 0 ? Math.round((row.counts.approved / decided) * 100) : null;
  return (
    <button
      className="lr-row lr-crew lr-draggable"
      type="button"
      draggable
      onDragStart={(event) => onDragStep(event, { kind: "agent", ref: row.ref, label: name ?? role })}
      onClick={() => onOpen(row.ref)}
      title={row.job || (name ?? role)}
    >
      <Mark agentRef={row.ref} job={row.job} />
      <span className="lr-row-main">
        <span className="lr-row-name">{name ?? role}</span>
        {row.hasRuns ? (
          <span className="lr-row-meta lr-crew-stats">
            <span className="lr-stat good"><Check size={11} />{row.counts.approved}</span>
            {pct !== null ? <span className="lr-stat-pct">{pct}%</span> : null}
            <span className="lr-stat-runs">{row.runCount} run{row.runCount === 1 ? "" : "s"}</span>
          </span>
        ) : (
          <span className="lr-row-meta">Not yet run</span>
        )}
      </span>
    </button>
  );
}
