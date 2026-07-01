import { useMemo, useState } from "react";
import { Lightbulb, Hammer, Trash2, LoaderCircle, Compass, ChevronDown, ChevronUp } from "lucide-react";
import type { OperatorSession } from "@/types";

// The founder's door onto an ideate pause. The operator generated ideas, graded them with a separate
// bar, and STOPPED — it never decides which become work. Two stages, set by where the project is in
// its life. "directions" (a project's beginning): kept ideas become ICP directions written into the ONE
// shared kernel — no pipelines composed, no per-idea channels created. "build" (a mature project):
// kept ideas compose into pipelines through compose_and_run. Either way nothing runs until you choose,
// and a kill teaches the next ideation round. This is the wall for the generate side.

type Verdict = "build" | "kill" | undefined;

// The generators lead each pitch with its segment ("Home services: …"). Split that prefix into a
// scannable title so the card reads as a decision, not a paragraph. Fallback: first clause.
function splitPitch(pitch: string): { title: string; rest: string } {
  const colon = pitch.indexOf(":");
  if (colon > 2 && colon <= 60) {
    return { title: pitch.slice(0, colon).trim(), rest: pitch.slice(colon + 1).trim() };
  }
  const firstBreak = pitch.search(/[—.]/);
  if (firstBreak > 8 && firstBreak <= 80) {
    return { title: pitch.slice(0, firstBreak).trim(), rest: pitch.slice(firstBreak + 1).trim() };
  }
  return { title: pitch.slice(0, 60).trim(), rest: pitch };
}

export function IdeaReview({ session, stage = "build", onResolve }: {
  session: OperatorSession;
  stage?: "directions" | "build";
  onResolve: (payload: { build: string[]; kill: string[]; mode?: "directions" | "build" }) => Promise<void>;
}) {
  const pending = session.pendingIdeas;
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const directions = stage === "directions";

  const { build, kill } = useMemo(() => {
    const b: string[] = [];
    const k: string[] = [];
    for (const [id, v] of Object.entries(verdicts)) {
      if (v === "build") b.push(id);
      else if (v === "kill") k.push(id);
    }
    return { build: b, kill: k };
  }, [verdicts]);

  // Strongest first — the founder compares scores, not paragraphs.
  const ideas = useMemo(() => {
    const list = [...(pending?.ideas ?? [])];
    list.sort((a, b) => (b.barScore ?? 0) - (a.barScore ?? 0));
    return list;
  }, [pending]);

  if (!pending) return null;
  const decided = build.length + kill.length;
  const keepLabel = directions ? "Keep" : "Build";
  const KeepIcon = directions ? Compass : Hammer;

  const set = (id: string, v: Verdict) =>
    setVerdicts((prev) => ({ ...prev, [id]: prev[id] === v ? undefined : v }));

  const submit = async () => {
    if (!decided || submitting) return;
    setSubmitting(true);
    try {
      await onResolve({ build, kill, mode: stage });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="idea-review">
      <div className="idea-review-head">
        <Lightbulb className="idea-review-icon" aria-hidden />
        <strong>{directions ? "Pick the directions worth exploring" : "Pick the ideas worth building"}</strong>
        <span className="idea-review-sub">
          {directions
            ? "This project is at its beginning. Kept ideas become ICP directions in the shared kernel — no pipelines yet; the operator comes back with the cheapest first probe."
            : "Kept ideas compose into pipelines that stop at your gate."}
          {" "}Killed ideas teach the next round.
          {pending.killedCount ? ` ${pending.killedCount} already fell below the bar.` : ""}
        </span>
      </div>

      <div className="idea-review-list" aria-label="Surviving ideas">
        {ideas.map((idea) => {
          const v = verdicts[idea.id];
          const { title, rest } = splitPitch(idea.pitch);
          const open = Boolean(expanded[idea.id]);
          return (
            <div key={idea.id} className={`idea-card ${v ? `is-${v}` : ""}`}>
              <div className="idea-card-body">
                <div className="idea-card-top">
                  <strong className="idea-card-title">{title}</strong>
                  {typeof idea.barScore === "number" ? (
                    <span className="idea-card-score" title="Graded by a separate critic, 0–10">
                      {idea.barScore.toFixed(1)}
                    </span>
                  ) : null}
                </div>
                {idea.angle ? <span className="idea-card-angle">{idea.angle}</span> : null}
                <p className={`idea-card-pitch ${open ? "" : "is-clamped"}`}>{rest}</p>
                <button
                  type="button"
                  className="idea-card-more"
                  onClick={() => setExpanded((prev) => ({ ...prev, [idea.id]: !open }))}
                  aria-expanded={open}
                >
                  {open ? <><ChevronUp size={12} /> less</> : <><ChevronDown size={12} /> more</>}
                </button>
              </div>
              <div className="idea-card-actions">
                <button
                  type="button"
                  className={`idea-card-btn build ${v === "build" ? "active" : ""}`}
                  onClick={() => set(idea.id, "build")}
                  aria-pressed={v === "build"}
                >
                  <KeepIcon size={13} /> {keepLabel}
                </button>
                <button
                  type="button"
                  className={`idea-card-btn kill ${v === "kill" ? "active" : ""}`}
                  onClick={() => set(idea.id, "kill")}
                  aria-pressed={v === "kill"}
                >
                  <Trash2 size={13} /> Kill
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="idea-review-foot">
        <span className="idea-review-tally">
          {build.length} to {directions ? "keep" : "build"} · {kill.length} to kill
        </span>
        <button type="button" className="idea-review-submit" disabled={!decided || submitting} onClick={() => void submit()}>
          {submitting ? <LoaderCircle size={14} className="spin" /> : null}
          {build.length ? `${keepLabel} ${build.length}${kill.length ? ` · kill ${kill.length}` : ""}` : `Kill ${kill.length}`}
        </button>
      </div>
    </div>
  );
}
