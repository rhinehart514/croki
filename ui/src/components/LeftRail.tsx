import { useEffect, useMemo, useState, type DragEvent } from "react";
import {
  Workflow, Users, Plus, ChevronDown,
  PanelLeftClose, PanelLeftOpen, Check, GripVertical, LayoutGrid, Blocks, Lock, Wrench,
} from "lucide-react";
import { agentPersona, humanizeRef } from "@/lib/agentPersona";
import { healthHex } from "@/lib/health";
import { STEP_DRAG_MIME } from "@/lib/objectPalette";
import { CrewFace } from "@/components/crew/CrewFace";
import { CrewRoom } from "@/components/crew/CrewRoom";
import { CrewComposer } from "@/components/crew/CrewComposer";
import { CAPABILITIES, STAGE_ORDER, STAGE_LABEL, capabilityMark, type Capability } from "@/lib/capabilities";
import { getCapabilityInventory, type AgentBenchRow } from "@/api";
import type { CapabilityInventory, ChannelMeta, GtmLibrary } from "@/types";
import "@/styles/left-rail.css";

// What a rail row writes on drag, read by the canvas drop target. A teammate is an agent/skill ref; a
// capability is an external service that lands as a stage step. One union so the drop handler branches.
export type StepDragPayload =
  | { kind: "agent" | "skill"; ref: string; label: string }
  | { kind: "capability"; id: string; name: string; stage: Capability["stage"]; gated: boolean };

// The founder's workspace rail — one always-present, opaque left column beside the canvas. It is a
// two-item PARTS BIN, not a filing cabinet: only the things that are genuinely "stuff you have" live at
// the top level — the pipelines you're running, and the crew of agents you've assembled. Everything
// else that used to sit here is really an attribute of those two: a tool is something an agent knows, a
// data source is a step inside a pipeline, and a belief block is a zoomed-out view of the canvas — none
// of them are top-level objects, so they no longer get a section here.
// Each pipeline and each agent carries a plain-English one-liner — what it does for you and when you'd
// reach for it — so the rail teaches the founder their own workspace instead of listing code names.
// The rail sits BESIDE the canvas, never over it, and collapses to a thin strip to hand the width back.

// The crew member's face — the pixel character from the shared library (same source every surface
// reads), which degrades to the two-letter monogram if the character can't render.
function Mark({ agentRef, job }: { agentRef: string; job?: string }) {
  return <CrewFace agentRef={agentRef} job={job} size={26} className="lr-mark" />;
}

// Plain-English fallback for what an agent does, keyed by its human role — used only when the agent
// carries no job description of its own. Written as "what it does for you, and when you'd reach for it",
// never as a code name, so a stranger reads the rail and understands the team without opening anything.
const ROLE_BLURB: Record<string, string> = {
  "Prospect Researcher": "Finds the people worth reaching and why now — pull it in when you need a fresh list.",
  "Signal Scout": "Watches for buying signals like new stars or sign-ups — reach for it to catch warm leads early.",
  "Qualification Analyst": "Scores your leads so you know who to call first — use it when a list is too big to work by hand.",
  "Enrichment Scout": "Fills in the missing details on a contact — add it when your list is thin on specifics.",
  "Call-Order Planner": "Ranks who to contact in what order — use it to plan a day of outreach.",
  "Outreach Writer": "Drafts the first message in your voice — reach for it when it's time to actually write.",
  "First-Contact Writer": "Writes the opening message to someone new — use it to start a conversation.",
  "Vouch Writer": "Turns a happy customer into a warm intro — use it when you have a fan to lean on.",
  "Content Strategist": "Plans and drafts content that earns search traffic — reach for it to build an inbound channel.",
  "Distribution Planner": "Maps where a piece gets seen after you publish — use it so good work actually travels.",
  "Lifecycle Engineer": "Nudges new signups toward their first real win — use it to turn trials into users.",
  "Growth Instrumenter": "Sets up the tracking to see what's working — use it before you scale a motion.",
  "Community Lead": "Builds a presence where your users already gather — reach for it to grow through community.",
  "Partnerships Lead": "Finds partners whose audience is your buyer — use it to grow through other people's reach.",
  "Paid Acquisition": "Plans and drafts paid campaigns — use it when you want to buy your way to reach.",
  "Referral Designer": "Builds a reason for users to invite others — reach for it to grow by word of mouth.",
};

function agentBlurb(row: AgentBenchRow): string {
  const job = row.job?.trim();
  if (job) return job;
  const { role } = agentPersona(row.ref, row.job);
  return ROLE_BLURB[role] ?? "A teammate you can drop into a pipeline — open it to see what it does.";
}

function pipelineBlurb(ch: ChannelMeta): string {
  const objective = ch.objective?.trim();
  if (objective) return objective;
  return "A pipeline you've started — set its goal and run it to your gate.";
}

function Section({
  icon, title, count, onNew, newTitle, action, children,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  onNew?: () => void;
  newTitle?: string;
  action?: React.ReactNode;   // an extra header affordance (e.g. "open the crew room"), left of + New
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
        {action}
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
  projectId = null,
  onLoadChannel,
  onNewChannel,
  onOpenAgent,
  onCrewChanged,
  onConnectCapability,
}: {
  channels: ChannelMeta[];
  activeChannelId: string | null;
  bench: AgentBenchRow[] | null;
  // The active project — the "+ build a teammate" flow scopes the new teammate to it.
  projectId?: string | null;
  onLoadChannel: (id: string) => void;
  onNewChannel: () => void;
  onOpenAgent: (ref: string) => void;
  // Fired after a teammate is built and added, so the host refetches the bench and the new face appears.
  onCrewChanged?: () => void;
  // Retained so App keeps compiling while the old Tools/Data/Blocks sections stay retired. None are
  // rendered anymore — a tool is something an agent knows, data is a step inside a pipeline, and blocks
  // are a zoomed-out canvas view, so none belong at the top level of the parts bin.
  library?: GtmLibrary | null;
  onOpenSkill?: (name: string) => void;
  onNewSkill?: () => void;
  // Connecting a capability is founder-initiated; App owns the actual connect flow. Optional so the rail
  // still renders the inviting roster before any connect handler is wired.
  onConnectCapability?: (id: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [crewRoomOpen, setCrewRoomOpen] = useState(false);
  const [crewComposerOpen, setCrewComposerOpen] = useState(false);
  // The LIVE capability inventory — the real tools the crew can reach right now, from the runtime. null
  // while loading OR when the backend hasn't produced the endpoint yet, in which case the rail falls back
  // to the suggested-connections catalog alone (render-if-present). Refetched when the crew changes.
  const [inventory, setInventory] = useState<CapabilityInventory | null>(null);
  useEffect(() => {
    let live = true;
    void getCapabilityInventory().then((inv) => { if (live) setInventory(inv); });
    return () => { live = false; };
  }, [projectId, bench]);

  // Drag a crew member OR a capability onto the canvas → the canvas-area drop target reads
  // STEP_DRAG_MIME and adds a pipeline step, switching to the build view so the founder watches it land.
  // A teammate carries { kind:"agent", ref }; a capability carries { kind:"capability", id, stage } and
  // the drop maps its run-stage to a graph stage (find→source, reach→gated execute, …).
  const onStepDragStart = (event: DragEvent<HTMLElement>, payload: StepDragPayload) => {
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
      // A teammate the founder named (built via "+") shows exactly that name; everything else falls back to
      // the derived role, disambiguated by the id when a role is shared.
      const chosen = r.name?.trim();
      nameByRef.set(r.ref, chosen || ((roleCount.get(role) ?? 0) > 1 ? humanizeRef(r.ref) : role));
    }
    return {
      proven: list.filter((r) => r.hasRuns),
      waiting: list.filter((r) => !r.hasRuns),
      nameByRef,
    };
  }, [bench]);

  if (collapsed) {
    return (
      <aside className="left-rail collapsed" aria-label="Workspace">
        <button className="lr-expand" type="button" onClick={() => setCollapsed(false)} title="Expand your workspace">
          <PanelLeftOpen size={16} />
        </button>
      </aside>
    );
  }

  return (
    <aside className="left-rail" aria-label="Workspace">
      <header className="lr-head">
        <span className="lr-head-title">Workspace</span>
        <button className="lr-collapse" type="button" onClick={() => setCollapsed(true)} title="Collapse — reclaim the width">
          <PanelLeftClose size={15} />
        </button>
      </header>

      <div className="lr-body">
        {/* Pipelines — your real work; click loads one onto the canvas. The one-liner is the goal it's
            chasing, so the list reads as intentions, not file names. */}
        <Section
          icon={<Workflow size={13} />}
          title="Pipelines"
          count={channels.length}
          onNew={onNewChannel}
          newTitle="Ideate a new pipeline"
        >
          {channels.length === 0 ? (
            <p className="lr-empty">No pipelines yet — start one and it lands here.</p>
          ) : (
            channels.map((ch) => (
              <button
                key={ch.id}
                className={`lr-row lr-stacked ${ch.id === activeChannelId ? "active" : ""}`}
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
                  <span className="lr-row-desc">{pipelineBlurb(ch)}</span>
                  <span className="lr-row-meta">
                    {ch.pendingGates > 0 ? `${ch.pendingGates} at the gate` : ch.runCount > 0 ? `${ch.runCount} run${ch.runCount === 1 ? "" : "s"}` : "never run"}
                  </span>
                </span>
              </button>
            ))
          )}
        </Section>

        {/* Your crew — the agents you've assembled. Click opens a teammate's profile; drag one onto the
            canvas to add it as a pipeline step. Proven above still-on-the-bench, so earned trust reads
            first. */}
        <Section
          icon={<Users size={13} />}
          title="Your crew"
          count={(bench ?? []).length}
          onNew={() => setCrewComposerOpen(true)}
          newTitle="Build a teammate with Claude"
          action={
            (bench ?? []).length > 0 ? (
              <button
                className="lr-shead-new"
                type="button"
                onClick={() => setCrewRoomOpen(true)}
                title="Open the crew room — your whole team at a glance"
              >
                <LayoutGrid size={13} />
              </button>
            ) : null
          }
        >
          {bench === null ? (
            <p className="lr-empty">Reading your crew…</p>
          ) : bench.length === 0 ? (
            <p className="lr-empty">No crew yet — assemble agents and they'll gather here.</p>
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
          {/* The inviting way in — a real row, not just the tiny header "+". Opens the same build-a-teammate
              space. Always present, so growing your crew is one obvious click. */}
          <button type="button" className="lr-row lr-crew-add" onClick={() => setCrewComposerOpen(true)} title="Build a teammate with Claude">
            <span className="lr-crew-add-face" aria-hidden="true"><Plus size={15} /></span>
            <span className="lr-row-main">
              <span className="lr-row-name">Build a teammate</span>
              <span className="lr-row-desc">Describe it — Claude drafts it for your crew.</span>
            </span>
          </button>
        </Section>

        {/* Capabilities — what your crew can ACTUALLY reach right now. When the live inventory is present,
            the real connected tools lead (grouped by server, each showing whether it runs free or acts
            behind your gate). The hardcoded brand list is demoted to "Suggested connections" — things you
            could connect, clearly labeled not-yet-connected — so the rail reflects reality, not a catalog.
            Falls back to the suggested list alone when the backend hasn't produced the inventory yet. */}
        {inventory && inventory.tools.length > 0 ? (
          <Section icon={<Blocks size={13} />} title="Capabilities" count={inventory.tools.length}>
            <ConnectedCapabilities inventory={inventory} />
            <div className="lr-cap-group">
              <div className="lr-group">Suggested connections · not connected yet</div>
              {CAPABILITIES.map((cap) => (
                <CapabilityRow key={cap.id} cap={cap} suggested onConnect={onConnectCapability} onDragStep={onStepDragStart} />
              ))}
            </div>
          </Section>
        ) : (
          <Section icon={<Blocks size={13} />} title="Capabilities" count={CAPABILITIES.length}>
            <div className="lr-cap-hint">Suggested connections — connect one to give your crew a real capability.</div>
            {STAGE_ORDER.map((stage) => {
              const caps = CAPABILITIES.filter((c) => c.stage === stage);
              if (caps.length === 0) return null;
              return (
                <div key={stage} className="lr-cap-group">
                  <div className="lr-group">{STAGE_LABEL[stage]}</div>
                  {caps.map((cap) => (
                    <CapabilityRow key={cap.id} cap={cap} suggested onConnect={onConnectCapability} onDragStep={onStepDragStart} />
                  ))}
                </div>
              );
            })}
          </Section>
        )}
      </div>

      {/* The crew room — your whole team as characters, opened from the crew header. Clicking a
          teammate steps into its profile (the same sheet the rail rows open). */}
      <CrewRoom
        open={crewRoomOpen}
        roster={bench ?? []}
        onClose={() => setCrewRoomOpen(false)}
        onOpen={(ref) => { setCrewRoomOpen(false); onOpenAgent(ref); }}
      />

      {/* Build a teammate with Claude — opened from the "+" on the crew header. On add, the host refetches
          the bench so the new face appears among the crew. */}
      {crewComposerOpen ? (
        <CrewComposer
          projectId={projectId}
          bench={bench}
          onClose={() => setCrewComposerOpen(false)}
          onAdded={() => { setCrewComposerOpen(false); onCrewChanged?.(); }}
        />
      ) : null}
    </aside>
  );
}

// The capability's mark: a real brand logo drawn in its own color where an open-licensed one exists,
// otherwise a clean lettermark tile in the brand's tone. The mark is the only place brand color lives —
// it's identity, not decoration — so the rail feels recognizable while the chrome stays monochrome zinc.
function CapabilityMark({ cap }: { cap: Capability }) {
  const mark = capabilityMark(cap);
  if (mark) {
    return (
      <span className="lr-cap-mark" style={{ ["--brand" as string]: `#${mark.hex}` }}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill={`#${mark.hex}`} aria-hidden="true">
          <path d={mark.path} />
        </svg>
      </span>
    );
  }
  const lm = cap.lettermark!;
  return (
    <span
      className="lr-cap-mark lr-cap-mark-letter"
      style={{ ["--brand" as string]: lm.hex, color: lm.hex }}
      aria-hidden="true"
    >
      {lm.text}
    </span>
  );
}

// One capability: logo, what it does, and two ways to use it — drag it onto the canvas to wire it into a
// pipeline as a stage step, or click Connect to hook up the service. Gated capabilities (they reach the
// outside world) show the amber gate marker beside the name. Draggable like a crew row, same grip.
function CapabilityRow({
  cap, onConnect, onDragStep, suggested,
}: {
  cap: Capability;
  onConnect?: (id: string) => void;
  onDragStep: (event: DragEvent<HTMLElement>, payload: StepDragPayload) => void;
  // A suggested (not-yet-connected) capability — visibly recessive, and its click is "connect", not
  // "use". A live connected tool renders through ConnectedCapabilities instead, never here.
  suggested?: boolean;
}) {
  return (
    <button
      className={`lr-row lr-cap lr-draggable${suggested ? " lr-cap-suggested" : ""}`}
      type="button"
      draggable
      onDragStart={(event) => onDragStep(event, { kind: "capability", id: cap.id, name: cap.name, stage: cap.stage, gated: !!cap.gated })}
      onClick={() => onConnect?.(cap.id)}
      title={suggested ? `Connect ${cap.name} to give your crew this capability` : `Drag ${cap.name} onto the canvas, or click to connect`}
    >
      <CapabilityMark cap={cap} />
      <span className="lr-row-main">
        <span className="lr-row-name">
          {cap.name}
          {cap.gated ? (
            <span className="lr-cap-gate" title="Reaches the outside world — only acts behind your gate" aria-label="gated" />
          ) : null}
        </span>
        <span className="lr-row-desc">{cap.blurb}</span>
      </span>
      <GripVertical className="lr-grip" size={14} aria-hidden="true" />
    </button>
  );
}

// The LIVE connected capabilities — the real tools the crew can reach right now, grouped by their server,
// each showing whether it runs free (read) or acts behind the gate (write). This is the truth the rail
// leads with; the brand catalog below it is only suggestions. Drag a tool onto the canvas to wire it as a
// step, exactly like a suggested capability, but keyed to the real serverId::toolName it came from.
function ConnectedCapabilities({ inventory }: { inventory: CapabilityInventory }) {
  const byServer = useMemo(() => {
    const map = new Map<string, CapabilityInventory["tools"]>();
    for (const t of inventory.tools) {
      const list = map.get(t.serverId) ?? [];
      list.push(t);
      map.set(t.serverId, list);
    }
    return [...map.entries()];
  }, [inventory.tools]);
  return (
    <div className="lr-cap-group">
      <div className="lr-group">Connected · your crew can reach these now</div>
      {byServer.map(([serverId, tools]) => (
        <div key={serverId} className="lr-cap-server">
          <div className="lr-cap-server-name">{serverId}</div>
          {tools.map((t) => (
            <div key={t.toolName} className="lr-row lr-cap lr-cap-live" title={`${t.toolName} — ${t.lane === "write" ? "acts behind your gate" : "runs free"}`}>
              <span className="lr-cap-tool-mark" aria-hidden><Wrench size={13} /></span>
              <span className="lr-row-main">
                <span className="lr-row-name">
                  {t.toolName}
                  {t.lane === "write" ? (
                    <span className="lr-cap-lane-gate" title="Acts on the world — only runs behind your gate"><Lock size={9} /></span>
                  ) : null}
                </span>
                <span className="lr-row-desc">{t.lane === "write" ? "Acts on the world — behind your gate" : "Reads only — runs free"}</span>
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
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
        <span className="lr-row-desc">{agentBlurb(row)}</span>
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
      <GripVertical className="lr-grip" size={14} aria-hidden="true" />
    </button>
  );
}
