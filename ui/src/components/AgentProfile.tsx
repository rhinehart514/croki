import { useEffect, useState } from "react";
import {
  Crosshair, FileCode2, History, PencilLine, ShieldCheck, Waypoints, X,
} from "lucide-react";
import { agentPersona, FAMILY_TINT } from "@/lib/agentPersona";
import { Button } from "@/components/ui/button";
import { getAgentLearning, type AgentLearning } from "@/api";
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
  open, view, team, projectId, onClose, onEditSource, onAddToCanvas, onSelectTeammate,
}: {
  open: boolean;
  view: AgentProfileView | null;
  team: TeammateView[];
  projectId?: string | null;
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

  // What this teammate has learned — derived from real gate decisions, fetched when the sheet opens.
  // Stamped with the ref it belongs to so we never render one agent's record on another's sheet, and
  // so "still loading" is simply "the loaded record isn't for the agent on screen yet."
  const [loaded, setLoaded] = useState<{ ref: string; data: AgentLearning | null } | null>(null);
  useEffect(() => {
    if (!open || !view || !projectId) return;
    let live = true;
    const ref = view.ref;
    getAgentLearning(projectId, ref)
      .then((r) => { if (live) setLoaded({ ref, data: r.profile }); })
      .catch(() => { if (live) setLoaded({ ref, data: null }); });
    return () => { live = false; };
  }, [open, view, projectId]);

  if (!open || !view) return null;

  const learning = loaded && loaded.ref === view.ref ? loaded.data : undefined;
  const loadingLearning = projectId ? learning === undefined : false;

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
            <div className="agentp-shead"><span className="agentp-sicon"><History size={13} /></span><h3>What I've become</h3></div>
            {loadingLearning ? (
              <p className="agentp-quiet">Reading my track record…</p>
            ) : !learning || !learning.hasRuns ? (
              <p className="agentp-quiet">No runs yet — I haven't drafted anything you've decided on, so there's nothing learned to show. Once you approve, reject, or edit my work at the gate, it lands here.</p>
            ) : (
              <>
                <div className="agentp-stats">
                  <div className="agentp-stat"><b>{learning.runCount}</b><span>run{learning.runCount === 1 ? "" : "s"}</span></div>
                  <div className="agentp-stat"><b>{learning.counts.approved}</b><span>approved</span></div>
                  <div className="agentp-stat"><b>{learning.counts.rejected}</b><span>rejected</span></div>
                  <div className="agentp-stat"><b>{learning.counts.edits}</b><span>edited</span></div>
                </div>
                {learning.lastEdits.length ? (
                  <div className="agentp-edits">
                    <div className="agentp-edits-h"><PencilLine size={12} /> How you've corrected me</div>
                    {learning.lastEdits.map((e, i) => (
                      <div className="agentp-edit" key={i}>
                        <div className="agentp-edit-side from"><span>you saw</span><p>{e.from}</p></div>
                        <div className="agentp-edit-side to"><span>you changed it to</span><p>{e.to}</p></div>
                      </div>
                    ))}
                  </div>
                ) : null}
                {learning.voice ? (
                  <div className="agentp-voice">
                    <div className="agentp-voice-h"><Waypoints size={12} /> How I write for you now</div>
                    <pre className="agentp-voice-body">{learning.voice}</pre>
                  </div>
                ) : null}
              </>
            )}
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
