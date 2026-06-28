import { useEffect } from "react";
import {
  ArrowLeftRight, Crosshair, FileCode2, History, RefreshCw, ShieldCheck, X,
} from "lucide-react";
import type { AgentCreationPolicy } from "@/types";
import { agentPersona, FAMILY_TINT } from "@/lib/agentPersona";
import { Button } from "@/components/ui/button";
import "@/styles/agent-profile.css";

// The normalized view of one agent, assembled by App from either a born AgentInstance (the
// personalized teammate) or a stock on-disk library agent. Everything here is REAL — no field is
// invented; the "person" feeling comes from the role name, the layout, and the framing labels, not
// from rewriting the agent's own data.
export type AgentProfileView = {
  ref: string;
  job: string;
  personalized: boolean;        // born for an outcome vs. a stock library capability
  status?: string;
  version?: number;
  inputContract: string[];
  outputContract: string[];
  policy: AgentCreationPolicy | null;
  evaluationCount: number;      // evaluations run for THIS agent (real)
  teamSignalCount: number;      // feedback signals across the whole team (real)
  teamEvalCount: number;        // evaluations across the whole team (real)
};

export type TeammateView = { ref: string; job: string };

function Mark({ agentRef, job, size = "lg" }: { agentRef: string; job?: string; size?: "lg" | "sm" }) {
  const { family, monogram } = agentPersona(agentRef, job);
  const tint = FAMILY_TINT[family];
  return (
    <div className={size === "lg" ? "agentp-mark" : "mm"} style={{ background: tint.bg, color: tint.fg }}>
      {monogram}
    </div>
  );
}

export function AgentProfile({
  open, view, team, onClose, onEditSource, onAddToCanvas, onSelectTeammate,
}: {
  open: boolean;
  view: AgentProfileView | null;
  team: TeammateView[];
  onClose: () => void;
  onEditSource: (ref: string) => void;
  onAddToCanvas?: (ref: string) => void;
  onSelectTeammate: (ref: string) => void;
}) {
  // Escape closes — the founder's expected way out of a centered sheet.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  if (!open || !view) return null;

  const { role } = agentPersona(view.ref, view.job);
  const policy = view.policy;
  const mission = policy?.purpose?.trim() || view.job;
  // Real guardrails, by source. Negative rules are the "never"s; evidence requirements are the
  // "always"s. The founder gate is the constant safety wall, shown explicitly even when the policy
  // states it tersely.
  const nevers = policy?.negativeRules ?? [];
  const musts = policy?.evidenceRequirements ?? [];
  const ruleCount = nevers.length + musts.length;
  const statusClass = view.status === "draft" ? "draft" : view.status === "retired" ? "retired" : "";

  return (
    <div className="agentp-scrim" role="dialog" aria-modal="true" aria-label={`${role} profile`}>
      {/* The backdrop is a real button so clicking outside closes — semantic, keyboard-reachable, and
          it never swallows clicks meant for the sheet (the sheet paints above it). */}
      <button type="button" className="agentp-scrim-close" aria-label="Close profile" onClick={onClose} />
      <div className="agentp-sheet">
        {/* ── who this is ── */}
        <aside className="agentp-ident">
          <Mark agentRef={view.ref} job={view.job} />
          <div className="agentp-eyebrow">
            {view.personalized ? "Personalized for this outcome" : "Library capability"}
          </div>
          <h1 className="agentp-role">{role}</h1>
          <div className="agentp-meta">
            <span className={`agentp-status ${statusClass}`}><span className="dot" />{view.status ? view.status[0].toUpperCase() + view.status.slice(1) : "Active"}</span>
            {view.version ? <span className="agentp-ver">v{view.version}{view.personalized ? " · born for this outcome" : ""}</span> : null}
          </div>
          <p className="agentp-mission">{mission}</p>

          <div className="agentp-stats">
            <div className="agentp-stat"><div className="n">{ruleCount}</div><div className="l">guardrails it holds</div></div>
            <div className="agentp-stat"><div className="n">{view.evaluationCount}</div><div className="l">evaluations run</div></div>
          </div>

          <div className="agentp-actions">
            {onAddToCanvas ? <Button onClick={() => onAddToCanvas(view.ref)} type="button">Put on the canvas</Button> : null}
            <Button variant="outline" onClick={() => onEditSource(view.ref)} type="button">
              <FileCode2 size={14} /> Edit the source file
            </Button>
          </div>

          <div className="agentp-ref">
            <b>Born from:</b> {view.personalized ? "a creation policy you can revise — not a stock connector." : "an on-disk agent definition."}<br />
            <code>~/.claude/agents/{view.ref}.md</code>
          </div>
        </aside>

        {/* ── the dossier ── */}
        <div className="agentp-body">
          <button className="agentp-close" onClick={onClose} type="button" aria-label="Close"><X size={16} /></button>

          <section className="agentp-section">
            <div className="agentp-shead"><span className="agentp-sicon"><Crosshair size={13} /></span><h3>What I do</h3></div>
            <p className="agentp-lead">{view.job}</p>
          </section>

          <section className="agentp-section">
            <div className="agentp-shead"><span className="agentp-sicon"><RefreshCw size={13} /></span><h3>What I'm learning</h3></div>
            <p className="agentp-learn-lead">
              I'm not a fixed script. Every time you approve, edit, or reject what I surface at the gate, that decision rewrites the <b>policy that creates the next version of me</b> — so I get more like your taste each run.
            </p>
            <div className="agentp-timeline">
              <div className="agentp-tl now">
                <div className="when">Now · v{view.version ?? 1}</div>
                <div className="what">{policy?.revisionReason?.trim()
                  ? <>Last revised because: {policy.revisionReason}</>
                  : <>Running on your starting policy. {mission}</>}</div>
              </div>
              <div className="agentp-tl">
                <div className="when">Next revision · triggered by your gate decisions</div>
                <div className="what">When you edit or reject what I bring you, that becomes a <b>feedback signal</b> folded into the next version's rules.</div>
              </div>
            </div>
            <div className="agentp-sig-row">
              <span className="agentp-sig">Learns from <b>your gate decisions</b></span>
              <span className="agentp-sig"><b>{view.teamSignalCount}</b> signals across your team</span>
              <span className="agentp-sig"><b>{view.teamEvalCount}</b> evaluations run</span>
            </div>
          </section>

          <section className="agentp-section">
            <div className="agentp-shead"><span className="agentp-sicon"><ArrowLeftRight size={13} /></span><h3>What I accept &amp; deliver</h3></div>
            <div className="agentp-contract">
              <div>
                <div className="agentp-col-label">I accept</div>
                {view.inputContract.length
                  ? view.inputContract.map((c, i) => <span className="agentp-chip" key={i}>{c}</span>)
                  : <span className="agentp-chip" style={{ color: "var(--faint)" }}>Self-sourcing — needs no input.</span>}
              </div>
              <div>
                <div className="agentp-col-label">I deliver</div>
                {view.outputContract.length
                  ? view.outputContract.map((c, i) => <span className="agentp-chip" key={i}>{c}</span>)
                  : <span className="agentp-chip" style={{ color: "var(--faint)" }}>Not yet declared.</span>}
              </div>
            </div>
          </section>

          <section className="agentp-section">
            <div className="agentp-shead"><span className="agentp-sicon"><ShieldCheck size={13} /></span><h3>My guardrails</h3></div>
            <div className="agentp-rails">
              {nevers.map((r, i) => <div className="agentp-rail no" key={`n${i}`}><span className="g">✕</span><span>{r}</span></div>)}
              {musts.map((r, i) => <div className="agentp-rail must" key={`m${i}`}><span className="g">✓</span><span>{r}</span></div>)}
              <div className="agentp-rail gate"><span className="g">⛉</span><span>Anything that touches the outside world stops at your founder gate. I never send.</span></div>
            </div>
          </section>

          <section className="agentp-section">
            <div className="agentp-shead"><span className="agentp-sicon"><History size={13} /></span><h3>Track record</h3></div>
            <p className="agentp-lead" style={{ fontSize: 14, color: "var(--muted)" }}>
              {view.evaluationCount > 0
                ? `${view.evaluationCount} evaluation${view.evaluationCount === 1 ? "" : "s"} run so far. Run health and per-item decisions land here as you work this teammate.`
                : "No runs yet for this version — a fresh teammate. Once it works, runs, last-run health, and per-item evaluations land here."}
            </p>
          </section>
        </div>

        {/* ── the rest of the team ── */}
        {team.length ? (
          <div className="agentp-team">
            <div className="agentp-team-h">Your go-to-market team · {team.length} teammate{team.length === 1 ? "" : "s"}</div>
            <div className="agentp-mates">
              {team.map((m) => {
                const p = agentPersona(m.ref, m.job);
                return (
                  <button
                    key={m.ref}
                    className={`agentp-mate ${m.ref === view.ref ? "on" : ""}`}
                    onClick={() => onSelectTeammate(m.ref)}
                    type="button"
                  >
                    <Mark agentRef={m.ref} job={m.job} size="sm" />
                    <span><span className="r">{p.role}</span><span className="j">{m.job}</span></span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
