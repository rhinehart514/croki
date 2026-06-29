import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight, Bot, ChevronDown, ChevronRight, LoaderCircle, Network, Plus, ShieldCheck, Trash2,
  Workflow, X,
} from "lucide-react";
import { composePortfolio, type PortfolioChannelSpec, type PortfolioGraph } from "@/api";
import { GraphCanvas } from "@/components/GraphCanvas";
import type { NodeSelection } from "@/types";
import "@/styles/portfolio-composer.css";

// "Propose the whole GTM system." One plain-language goal blooms into SEVERAL channels (an outbound
// motion, a referral loop, an attribution repair); the operator composes each one's real topology and
// unions them into a single branching, multi-gate diagram. This is the dashboard front door to that
// move — until now it was reachable only from the agent/MCP side. Compose-only: nothing persists and
// nothing is sent. The founder sees the entire system, gates and all, before committing anything.
//
// Layout is a builder rail (the goal + the channels you want to run together) beside a preview that,
// once composed, shows the systems that were unioned in and the assembled diagram itself.

// A channel the founder is assembling. `id` is derived from the title at compose time, so the spec
// stays stable across re-composes (the same idempotency the backend `channelSpecFrom` relies on).
type AgentDraft = { localId: string; ref: string; role: string; objective: string };
type ChannelDraft = {
  localId: string;
  title: string;
  objective: string;
  agents: AgentDraft[];
  agentsOpen: boolean;
};

// The compose payload accepts inline agents per channel (the backend `agentSpecsFrom` reads them off
// each channel entry). PortfolioChannelSpec carries id/title/objective; the agents ride alongside as
// an optional extension, so the typed `composePortfolio` contract is honored without widening it.
type ChannelPayload = PortfolioChannelSpec & {
  agents?: { ref: string; role?: string; objective?: string }[];
};

let draftSeq = 0;
const nextId = () => `pfc-${++draftSeq}`;

const slug = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "channel";

const emptyChannel = (): ChannelDraft => ({
  localId: nextId(),
  title: "",
  objective: "",
  agents: [],
  agentsOpen: false,
});

const EXAMPLE_GOAL = "Land 5 pilot conversations with compliance leaders this month";

export function PortfolioComposer({
  projectId,
  goal: initialGoal = "",
  onClose,
}: {
  projectId: string;
  // Prefilled from the founder's stated outcome (the goal launcher / active program), so "propose a
  // system" continues the goal they already named instead of asking for it again.
  goal?: string;
  onClose: () => void;
}) {
  const [goal, setGoal] = useState(initialGoal);
  const [channels, setChannels] = useState<ChannelDraft[]>(() => [emptyChannel(), emptyChannel()]);
  const [composing, setComposing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioGraph | null>(null);
  const [selection, setSelection] = useState<NodeSelection>(null);

  // Esc closes the surface, matching the rest of the dashboard's overlays.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const patchChannel = useCallback((localId: string, patch: Partial<ChannelDraft>) => {
    setChannels((prev) => prev.map((c) => (c.localId === localId ? { ...c, ...patch } : c)));
  }, []);
  const removeChannel = useCallback((localId: string) => {
    setChannels((prev) => (prev.length > 1 ? prev.filter((c) => c.localId !== localId) : prev));
  }, []);
  const addChannel = useCallback(() => setChannels((prev) => [...prev, emptyChannel()]), []);

  const patchAgent = useCallback((channelId: string, agentId: string, patch: Partial<AgentDraft>) => {
    setChannels((prev) => prev.map((c) =>
      c.localId !== channelId ? c : { ...c, agents: c.agents.map((a) => (a.localId === agentId ? { ...a, ...patch } : a)) }));
  }, []);
  const addAgent = useCallback((channelId: string) => {
    setChannels((prev) => prev.map((c) =>
      c.localId !== channelId ? c : {
        ...c, agentsOpen: true,
        agents: [...c.agents, { localId: nextId(), ref: "", role: "", objective: "" }],
      }));
  }, []);
  const removeAgent = useCallback((channelId: string, agentId: string) => {
    setChannels((prev) => prev.map((c) =>
      c.localId !== channelId ? c : { ...c, agents: c.agents.filter((a) => a.localId !== agentId) }));
  }, []);

  // A channel is composable once it has both a name and an objective — the two fields the composer
  // needs to design its topology. Empty drafts are simply ignored at compose time.
  const readyChannels = useMemo(
    () => channels.filter((c) => c.title.trim() && c.objective.trim()),
    [channels],
  );
  const canCompose = !!goal.trim() && readyChannels.length >= 1 && !composing;

  const compose = useCallback(async () => {
    if (!goal.trim() || readyChannels.length === 0 || composing) return;
    setComposing(true);
    setError(null);
    try {
      const payload: ChannelPayload[] = readyChannels.map((c) => {
        const agents = c.agents
          .filter((a) => a.ref.trim() || a.role.trim() || a.objective.trim())
          .map((a) => ({
            ref: a.ref.trim() || slug(a.role || a.objective),
            ...(a.role.trim() ? { role: a.role.trim() } : {}),
            ...(a.objective.trim() ? { objective: a.objective.trim() } : {}),
          }));
        return {
          id: `channel:${slug(c.title)}`,
          title: c.title.trim(),
          objective: c.objective.trim(),
          ...(agents.length ? { agents } : {}),
        };
      });
      const result = await composePortfolio(projectId, { goal: goal.trim(), channels: payload });
      setPortfolio(result);
      setSelection(null);
    } catch (err) {
      setPortfolio(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setComposing(false);
    }
  }, [goal, readyChannels, composing, projectId]);

  // Real, derived-from-the-graph counts — never seeded. The gate count is the wall made legible: how
  // many founder-review points the whole system carries.
  const systems = portfolio?.systems ?? [];
  const totalSteps = portfolio?.nodes.length ?? 0;
  const gateCount = portfolio?.nodes.filter((n) => n.category === "gate").length ?? 0;
  const executeCount = portfolio?.nodes.filter((n) => n.category === "execute").length ?? 0;

  return (
    <div className="pfc-overlay" role="dialog" aria-modal="true" aria-label="Propose a GTM system" onClick={onClose}>
      <div className="pfc-modal" onClick={(e) => e.stopPropagation()}>
        <header className="pfc-head">
          <div className="pfc-head-title">
            <Network />
            <div className="pfc-head-text">
              <strong>Propose a system</strong>
              <span>State one goal, name the channels to run together, and see the whole GTM system as one diagram.</span>
            </div>
          </div>
          <button className="pfc-close" type="button" onClick={onClose} aria-label="Close">
            <X />
          </button>
        </header>

        <div className="pfc-body">
          {/* ── Builder rail ── the goal + the channels you want composed together ── */}
          <div className="pfc-rail">
            <section className="pfc-section">
              <label className="pfc-label" htmlFor="pfc-goal">The one goal</label>
              <textarea
                id="pfc-goal"
                className="pfc-goal-input"
                placeholder={`e.g. ${EXAMPLE_GOAL}`}
                value={goal}
                rows={2}
                disabled={composing}
                onChange={(e) => setGoal(e.target.value)}
              />
            </section>

            <section className="pfc-section">
              <div className="pfc-section-head">
                <span className="pfc-label">Channels to run toward it</span>
                <span className="pfc-count">{readyChannels.length} ready</span>
              </div>

              <div className="pfc-channels">
                {channels.map((c, i) => (
                  <div className="pfc-channel" key={c.localId}>
                    <div className="pfc-channel-head">
                      <span className="pfc-channel-num">{i + 1}</span>
                      <input
                        className="pfc-channel-title"
                        placeholder="Channel name — e.g. Ecosystem referrals"
                        value={c.title}
                        disabled={composing}
                        onChange={(e) => patchChannel(c.localId, { title: e.target.value })}
                      />
                      <button
                        className="pfc-icon-btn"
                        type="button"
                        title="Remove channel"
                        aria-label="Remove channel"
                        disabled={composing || channels.length <= 1}
                        onClick={() => removeChannel(c.localId)}
                      >
                        <Trash2 />
                      </button>
                    </div>
                    <textarea
                      className="pfc-channel-objective"
                      placeholder="What this channel is trying to achieve…"
                      value={c.objective}
                      rows={2}
                      disabled={composing}
                      onChange={(e) => patchChannel(c.localId, { objective: e.target.value })}
                    />

                    {/* Advanced: who runs it — inline agent specs the composer binds into this channel.
                        Optional; left empty, the composer mints the teammates the channel needs. */}
                    <button
                      className="pfc-agents-toggle"
                      type="button"
                      aria-expanded={c.agentsOpen}
                      onClick={() => patchChannel(c.localId, { agentsOpen: !c.agentsOpen })}
                    >
                      {c.agentsOpen ? <ChevronDown /> : <ChevronRight />}
                      <Bot />
                      <span>Who runs it{c.agents.length ? ` · ${c.agents.length}` : ""}</span>
                    </button>
                    {c.agentsOpen ? (
                      <div className="pfc-agents">
                        {c.agents.map((a) => (
                          <div className="pfc-agent" key={a.localId}>
                            <div className="pfc-agent-row">
                              <input
                                className="pfc-agent-role"
                                placeholder="Role — e.g. Referral Scout"
                                value={a.role}
                                disabled={composing}
                                onChange={(e) => patchAgent(c.localId, a.localId, { role: e.target.value })}
                              />
                              <button
                                className="pfc-icon-btn"
                                type="button"
                                title="Remove agent"
                                aria-label="Remove agent"
                                disabled={composing}
                                onClick={() => removeAgent(c.localId, a.localId)}
                              >
                                <X />
                              </button>
                            </div>
                            <input
                              className="pfc-agent-objective"
                              placeholder="What this teammate does on this channel…"
                              value={a.objective}
                              disabled={composing}
                              onChange={(e) => patchAgent(c.localId, a.localId, { objective: e.target.value })}
                            />
                          </div>
                        ))}
                        <button className="pfc-add-agent" type="button" disabled={composing} onClick={() => addAgent(c.localId)}>
                          <Plus /> Add a teammate
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>

              <button className="pfc-add-channel" type="button" disabled={composing} onClick={addChannel}>
                <Plus /> Add a channel
              </button>
            </section>

            {error ? <div className="pfc-error">{error}</div> : null}

            <div className="pfc-rail-foot">
              <button className="pfc-compose" type="button" disabled={!canCompose} onClick={() => void compose()}>
                {composing ? <LoaderCircle className="spin" /> : <Network />}
                {composing ? "Composing the system…" : "Compose the system"}
              </button>
              <p className="pfc-note">
                <ShieldCheck /> Compose-only. Nothing is saved or sent — every send stays behind a founder gate.
              </p>
            </div>
          </div>

          {/* ── Preview ── the systems unioned in + the assembled branching diagram ── */}
          <div className="pfc-main">
            {portfolio ? (
              <>
                <div className="pfc-summary">
                  <div className="pfc-summary-stats">
                    <span className="pfc-stat"><b>{systems.length}</b> system{systems.length === 1 ? "" : "s"}</span>
                    <span className="pfc-stat"><b>{totalSteps}</b> step{totalSteps === 1 ? "" : "s"}</span>
                    <span className="pfc-stat pfc-stat-gate"><ShieldCheck /><b>{gateCount}</b> founder gate{gateCount === 1 ? "" : "s"}</span>
                    {executeCount > 0 ? (
                      <span className="pfc-stat"><b>{executeCount}</b> send{executeCount === 1 ? "" : "s"} · all gated</span>
                    ) : null}
                  </div>
                  <div className="pfc-systems">
                    {systems.map((s) => (
                      <div className="pfc-system-tile" key={s.id}>
                        <div className="pfc-system-tile-head">
                          <Workflow />
                          <span className="pfc-system-tile-name">{s.label}</span>
                        </div>
                        {s.objective ? <p className="pfc-system-tile-obj">{s.objective}</p> : null}
                        <div className="pfc-system-tile-meta">
                          <span>{s.nodeIds.length} step{s.nodeIds.length === 1 ? "" : "s"}</span>
                          <span className="pfc-system-tile-gate"><ShieldCheck /> {s.gateIds.length} gate{s.gateIds.length === 1 ? "" : "s"}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="pfc-canvas">
                  <GraphCanvas
                    graph={portfolio}
                    result={null}
                    running={false}
                    selection={selection}
                    connectors={[]}
                    onSelect={setSelection}
                  />
                </div>
              </>
            ) : (
              <div className="pfc-empty">
                <div className="pfc-empty-icon">{composing ? <LoaderCircle className="spin" /> : <Network />}</div>
                <strong>{composing ? "Composing the whole system…" : "Your GTM system, as one diagram"}</strong>
                <p>
                  {composing
                    ? "Reading your product and designing each channel's topology, then unioning them into one branching, multi-gate diagram."
                    : "Name a goal and the channels you want to run together, then compose. Each channel becomes its own system, and you see them merged into one branching flow — every send held behind a founder gate."}
                </p>
                {!composing ? (
                  <span className="pfc-empty-hint"><ArrowRight /> Add at least one channel with a name and an objective</span>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
