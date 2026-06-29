import { useEffect } from "react";
import {
  Crosshair, FileCode2, ShieldCheck, X,
} from "lucide-react";
import { agentPersona, FAMILY_TINT } from "@/lib/agentPersona";
import { Button } from "@/components/ui/button";
import "@/styles/agent-profile.css";

// The normalized view of one on-disk library agent. Everything here is REAL — no field is invented;
// the "person" feeling comes from the role name, the layout, and the framing labels, not from
// rewriting the agent's own data.
export type AgentProfileView = {
  ref: string;
  job: string;
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

  return (
    <div className="agentp-scrim" role="dialog" aria-modal="true" aria-label={`${role} profile`}>
      {/* The backdrop is a real button so clicking outside closes — semantic, keyboard-reachable, and
          it never swallows clicks meant for the sheet (the sheet paints above it). */}
      <button type="button" className="agentp-scrim-close" aria-label="Close profile" onClick={onClose} />
      <div className="agentp-sheet">
        {/* ── who this is ── */}
        <aside className="agentp-ident">
          <Mark agentRef={view.ref} job={view.job} />
          <div className="agentp-eyebrow">Library capability</div>
          <h1 className="agentp-role">{role}</h1>
          <div className="agentp-meta">
            <span className="agentp-status"><span className="dot" />Active</span>
          </div>
          <p className="agentp-mission">{view.job}</p>

          <div className="agentp-actions">
            {onAddToCanvas ? <Button onClick={() => onAddToCanvas(view.ref)} type="button">Put on the canvas</Button> : null}
            <Button variant="outline" onClick={() => onEditSource(view.ref)} type="button">
              <FileCode2 size={14} /> Edit the source file
            </Button>
          </div>

          <div className="agentp-ref">
            <b>Born from:</b> an on-disk agent definition.<br />
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
            <div className="agentp-shead"><span className="agentp-sicon"><ShieldCheck size={13} /></span><h3>My guardrails</h3></div>
            <div className="agentp-rails">
              <div className="agentp-rail gate"><span className="g">⛉</span><span>Anything that touches the outside world stops at your founder gate. I never send.</span></div>
            </div>
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
