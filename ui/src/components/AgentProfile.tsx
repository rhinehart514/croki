import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Crosshair, FileCode2, GraduationCap, Lightbulb, MessageSquare, ShieldCheck, X,
} from "lucide-react";
import { agentPersona, humanizeRef, agentOrigin, AGENT_ORIGIN_LABEL } from "@/lib/agentPersona";
import { CrewFace } from "@/components/crew/CrewFace";
import { Button } from "@/components/ui/button";
import {
  getCrewMemberProfile, promoteCrewLearning, dismissCrewLearning,
  type CrewMemberProfile,
} from "@/api";
import "@/styles/agent-profile.css";

// The durable track record, in plain words. Only real, non-zero signals appear — a teammate that has
// never sent for you shows just its runs, never a fake "0 replies". Empty when there's nothing real.
function trackRecordLine(record: CrewMemberProfile["record"]): string | null {
  const parts: string[] = [];
  if (record.runs > 0) parts.push(`${record.runs} run${record.runs === 1 ? "" : "s"}`);
  if (record.sent > 0) parts.push(`${record.sent} sent`);
  if (record.replies > 0) parts.push(`${record.replies} repl${record.replies === 1 ? "y" : "ies"}`);
  if (record.wins > 0) parts.push(`${record.wins} win${record.wins === 1 ? "" : "s"}`);
  return parts.length ? `Proven on ${parts.join(" · ")}` : null;
}

// The normalized view of one on-disk library agent. Everything here is REAL — no field is invented;
// the "person" feeling comes from the role name, the layout, and the framing labels, not from
// rewriting the agent's own data.
export type AgentProfileView = {
  ref: string;
  job: string;
};

export type TeammateView = { ref: string; job: string };

function Mark({ agentRef, job, size = "lg" }: { agentRef: string; job?: string; size?: "lg" | "sm" }) {
  // The teammate's crew face — the hero avatar sits inside a calm ring; the team-grid one stands on its
  // own soft family chip. Both degrade to the monogram if the character can't render.
  if (size === "lg") {
    return (
      <span className="agentp-mark">
        <CrewFace agentRef={agentRef} job={job} size={64} />
      </span>
    );
  }
  return <CrewFace agentRef={agentRef} job={job} size={36} />;
}

// Never let a scaffold or empty frontmatter line reach the founder. Some on-disk agent files still
// carry the starter description ("One line on what this subagent does…"), and a project-composed agent
// may carry none at all. Either way, that boilerplate is not a real description — return "" so the
// caller can show an honest, role-based line instead of the template text.
const TEMPLATE_MARKERS = [
  "one line on what",
  "when to invoke it",
  "the model reads this",
  "a library agent. open the source",
  "open the source to see what it does",
];
function cleanJob(job: string | undefined): string {
  const text = (job ?? "").trim();
  if (!text) return "";
  const low = text.toLowerCase();
  return TEMPLATE_MARKERS.some((m) => low.includes(m)) ? "" : text;
}

// Empty-run exhaust dressed as a lesson. When a teammate runs on an empty or missing input, it can emit
// a machine verdict ("no draft was provided to audit", "cannot issue a pass verdict on empty input") that
// teaches nothing about the founder's taste — it only makes the crew look confused. These are internal
// no-ops, not lessons, so they never belong in a founder-facing learning feed. Detect them by the phrases
// a no-op / error verdict falls into and drop them.
const NON_LESSON_MARKERS = [
  "no draft",
  "nothing to",
  "cannot issue",
  "can not issue",
  "empty input",
  "no op",
  "no-op",
  "provided to audit",
  "no input",
  "no items",
  "nothing was provided",
  "there is nothing",
];
function isRealLesson(text: string | undefined): boolean {
  const low = (text ?? "").trim().toLowerCase();
  if (!low) return false;
  return !NON_LESSON_MARKERS.some((m) => low.includes(m));
}
function realLessons<T extends { text: string }>(lessons: T[] | undefined): T[] {
  return (lessons ?? []).filter((l) => isRealLesson(l.text));
}

// A plain, non-alarming date stamp for a lesson receipt — "taught Jul 8", never a raw ISO string.
function taughtStamp(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `Taught ${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

export function AgentProfile({
  open, view, team, projectId, focusedQuestion, onClose, onEditSource, onAddToCanvas, onSelectTeammate, onGatherEvidence,
}: {
  open: boolean;
  view: AgentProfileView | null;
  team: TeammateView[];
  projectId?: string | null;
  // The question currently focused on the canvas, when any (question altitude). When present, the sidecar
  // reads this teammate's position ON it — its belief, uncertainty, next move, and "what would change my
  // mind." Absent → the sidecar shows the teammate's standing profile only. Honest either way.
  focusedQuestion?: { id: string; text: string } | null;
  onClose: () => void;
  onEditSource: (ref: string) => void;
  onAddToCanvas?: (ref: string) => void;
  onSelectTeammate: (ref: string) => void;
  // The spec-native evidence action: turn "what would change my mind" into a real, reversible move —
  // it focuses the composer to gather that exact evidence, grounded in the teammate's real falsifier.
  // Absent → the action still shows, honestly disabled. Never sends; it stages a discovery step.
  onGatherEvidence?: (ref: string, falsifier: string) => void;
}) {
  // Escape closes — the founder's expected way out of a centered sheet.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  // The teammate's SOUL — its durable track record and the lessons it has learned from the founder.
  // Fetched when the sheet opens; stamped with the ref so one teammate's soul never renders on another's.
  const [soul, setSoul] = useState<{ ref: string; data: CrewMemberProfile | null } | null>(null);
  const loadSoul = useCallback((ref: string) => {
    if (!projectId) return;
    getCrewMemberProfile(projectId, ref)
      .then((r) => setSoul({ ref, data: r.profile }))
      .catch(() => setSoul({ ref, data: null }));
  }, [projectId]);
  useEffect(() => {
    if (!open || !view || !projectId) return;
    let live = true;
    const ref = view.ref;
    getCrewMemberProfile(projectId, ref)
      .then((r) => { if (live) setSoul({ ref, data: r.profile }); })
      .catch(() => { if (live) setSoul({ ref, data: null }); });
    return () => { live = false; };
  }, [open, view, projectId]);

  // The founder's blessing / "not yet" on a ready lesson. Each returns the fresh founder-view, which
  // replaces the soul in place so the card updates without a reload. The founder is always the judge:
  // a lesson only becomes permanent on an explicit tap here (the wall), never on its own.
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const onBless = useCallback((ref: string, patternKey: string, keep: boolean) => {
    if (!projectId || busyKey) return;
    setBusyKey(patternKey);
    const call = keep ? promoteCrewLearning : dismissCrewLearning;
    call(projectId, ref, patternKey)
      .then((r) => setSoul({ ref, data: r.profile }))
      .catch(() => loadSoul(ref))
      .finally(() => setBusyKey(null));
  }, [projectId, busyKey, loadSoul]);

  // Names in the team rail must be unique. The persona role vocabulary is coarser than a real crew, so
  // several distinct agents can map to the same role (five "Prospect Researcher" cards). When a role is
  // shared, fall back to each agent's own descriptive name — unique, and more specific than the role.
  // Same rule the bench uses, so the two rosters read the same way.
  const nameByRef = useMemo(() => {
    const roleCount = new Map<string, number>();
    const roleByRef = new Map<string, string>();
    for (const m of team) {
      const { role } = agentPersona(m.ref, m.job);
      roleByRef.set(m.ref, role);
      roleCount.set(role, (roleCount.get(role) ?? 0) + 1);
    }
    const out = new Map<string, string>();
    for (const m of team) {
      const role = roleByRef.get(m.ref) ?? m.ref;
      out.set(m.ref, (roleCount.get(role) ?? 0) > 1 ? humanizeRef(m.ref) : role);
    }
    return out;
  }, [team]);

  if (!open || !view) return null;

  // The soul for the teammate on screen (never a stale ref's). This is the SINGLE "what this teammate
  // has learned from you" story — its durable track record, the lessons it has earned, what it's still
  // figuring out, and any lesson ready for the founder's blessing. It renders in every state: still
  // loading, honestly empty (no runs decided on yet), or full. There is no separate legacy section.
  const soulData = soul && soul.ref === view.ref ? soul.data : null;
  const soulPending = !soul || soul.ref !== view.ref;
  const recordLine = soulData ? trackRecordLine(soulData.record) : null;
  // Only real, taste-bearing lessons reach the founder — empty-run / error verdicts are filtered out of
  // every list (learned, still-figuring, ready) so a confused no-op never masquerades as something the
  // teammate learned. Everything below reads from these, not the raw soul.
  const learned = realLessons(soulData?.learned);
  const stillFiguring = realLessons(soulData?.stillFiguring);
  const ready = realLessons(soulData?.ready);
  const hasSoul = !!soulData && (
    !!recordLine || learned.length > 0 || stillFiguring.length > 0 || ready.length > 0
  );

  const { role } = agentPersona(view.ref, view.job);
  // What this teammate does, in words a founder can trust — the real frontmatter line when there is
  // one, otherwise an honest sentence built from the role. Never the scaffold text or a blank.
  const mission = cleanJob(view.job) || `A ${role.toLowerCase()} on your crew. Open the source file to see exactly what it does.`;

  return (
    <div className="agentp-scrim" role="dialog" aria-modal="true" aria-label={`${role} profile`}>
      {/* The backdrop is a real button so clicking outside closes — semantic, keyboard-reachable, and
          it never swallows clicks meant for the sheet (the sheet paints above it). */}
      <button type="button" className="agentp-scrim-close" aria-label="Close profile" onClick={onClose} />
      <div className="agentp-sheet">
        {/* ── who this is ── */}
        <aside className="agentp-ident">
          <Mark agentRef={view.ref} job={view.job} />
          <div className="agentp-eyebrow">{AGENT_ORIGIN_LABEL[agentOrigin(view.ref)].label}</div>
          <h1 className="agentp-role">{role}</h1>
          <div className="agentp-meta">
            <span className="agentp-status"><span className="dot" />Active</span>
          </div>
          <p className="agentp-mission">{mission}</p>

          <div className="agentp-actions">
            {onAddToCanvas ? <Button onClick={() => onAddToCanvas(view.ref)} type="button">Put on the canvas</Button> : null}
          </div>

          {/* A quiet developer escape hatch — a technical user can still open this teammate's underlying
              definition, but it never sits in the founder's eyeline. No file path is ever shown; the
              path is engineering exhaust, not something a founder should read or be pointed at. */}
          <button
            type="button"
            className="agentp-devlink"
            onClick={() => onEditSource(view.ref)}
            title="Open this teammate's definition (advanced)"
          >
            <FileCode2 size={12} /> Advanced
          </button>
        </aside>

        {/* ── the dossier ── */}
        <div className="agentp-body">
          <button className="agentp-close" onClick={onClose} type="button" aria-label="Close"><X size={16} /></button>

          <section className="agentp-section">
            <div className="agentp-shead"><span className="agentp-sicon"><Crosshair size={13} /></span><h3>What I do</h3></div>
            <p className="agentp-lead">{mission}</p>
          </section>

          {/* ── My position (question altitude) — this teammate's attributable belief on the focused
              question, kept distinct from every other teammate's (never a blended consensus). Shown only
              when a question is focused; honest empty until a position is recorded. ── */}
          {focusedQuestion ? (
            <section className="agentp-section">
              <div className="agentp-shead"><span className="agentp-sicon"><MessageSquare size={13} /></span><h3>My position</h3></div>
              <p className="agentp-quiet agentp-pos-q">On: “{focusedQuestion.text}”</p>
              {soulData?.position?.claim ? (
                <>
                  <p className="agentp-lead">{soulData.position.claim}</p>
                  {soulData.position.uncertainty ? (
                    <p className="agentp-pos-line"><b>Still unsure:</b> {soulData.position.uncertainty}</p>
                  ) : null}
                  {soulData.position.recommendation ? (
                    <p className="agentp-pos-line"><b>I'd do next:</b> {soulData.position.recommendation}</p>
                  ) : null}
                </>
              ) : (
                <p className="agentp-quiet">No position recorded on this question yet. Ask me and I'll take one — with my evidence and what would change my mind.</p>
              )}
            </section>
          ) : null}

          {/* ── What would change my mind — the falsifier, turned into a real, reversible evidence move
              (the spec-native "what would change my mind" action). Never theater: the button stages a
              discovery step in the composer; it never sends. ── */}
          {soulData?.falsifier ? (
            <section className="agentp-section">
              <div className="agentp-shead"><span className="agentp-sicon"><Lightbulb size={13} /></span><h3>What would change my mind</h3></div>
              <p className="agentp-lead">{soulData.falsifier}</p>
              <div className="agentp-actions">
                <Button
                  type="button"
                  variant="outline"
                  disabled={!onGatherEvidence}
                  onClick={() => onGatherEvidence?.(view.ref, soulData.falsifier ?? "")}
                >
                  <Lightbulb size={14} /> Go find that evidence
                </Button>
              </div>
            </section>
          ) : null}

          <section className="agentp-section">
            <div className="agentp-shead">
              <span className="agentp-sicon"><GraduationCap size={13} /></span><h3>What I've learned from you</h3>
              {taughtStamp(soulData?.lastTaughtAt) ? <span className="agentp-taught">{taughtStamp(soulData?.lastTaughtAt)}</span> : null}
            </div>

            {soulPending ? (
              <p className="agentp-quiet">Reading my track record…</p>
            ) : !hasSoul || !soulData ? (
              <p className="agentp-quiet">No runs yet — I haven't drafted anything you've decided on, so there's nothing learned to show. Once you approve, reject, or edit my work at the gate, what I learn from it lands here.</p>
            ) : (
              <>
                {recordLine ? <p className="agentp-soul-record">{recordLine}</p> : null}

                {learned.length ? (
                  <ul className="agentp-soul-list">
                    {learned.map((l, i) => (
                      <li className="agentp-soul-lesson" key={`learned-${i}`}>
                        <span className="agentp-soul-tick" aria-hidden="true">✓</span>
                        <span className="agentp-soul-lesson-body">
                          <span className="agentp-soul-lesson-text">{l.text}</span>
                          {l.why ? <span className="agentp-soul-lesson-why">{l.why}</span> : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (stillFiguring.length || ready.length) ? (
                  <p className="agentp-quiet">Nothing permanent yet — the lessons below become part of me when you say so.</p>
                ) : (
                  <p className="agentp-quiet">Still learning your taste — decisions you make here become part of me.</p>
                )}

                {stillFiguring.length ? (
                  <div className="agentp-soul-block">
                    <div className="agentp-soul-blabel">Still figuring out</div>
                    <ul className="agentp-soul-list">
                      {stillFiguring.map((l, i) => (
                        <li className="agentp-soul-lesson watching" key={`figuring-${i}`}>
                          <span className="agentp-soul-lesson-body">
                            <span className="agentp-soul-lesson-text">{l.text}</span>
                            {l.why ? <span className="agentp-soul-lesson-why">{l.why}</span> : null}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {ready.map((l) => (
                  <div className="agentp-soul-ready" key={`ready-${l.patternKey}`}>
                    <div className="agentp-soul-ready-h">Ready to make permanent?</div>
                    <p className="agentp-soul-ready-text">{l.text}</p>
                    {l.why ? <p className="agentp-soul-ready-why">{l.why}</p> : null}
                    <div className="agentp-soul-ready-acts">
                      <Button
                        type="button"
                        disabled={busyKey === l.patternKey}
                        onClick={() => onBless(view.ref, l.patternKey, true)}
                      >
                        Make permanent
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={busyKey === l.patternKey}
                        onClick={() => onBless(view.ref, l.patternKey, false)}
                      >
                        Not yet
                      </Button>
                    </div>
                  </div>
                ))}
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
                const job = cleanJob(m.job);
                return (
                  <button
                    key={m.ref}
                    className={`agentp-mate ${m.ref === view.ref ? "on" : ""}`}
                    onClick={() => onSelectTeammate(m.ref)}
                    type="button"
                  >
                    <Mark agentRef={m.ref} job={m.job} size="sm" />
                    <span><span className="r">{nameByRef.get(m.ref) ?? p.role}</span>{job ? <span className="j">{job}</span> : null}</span>
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
