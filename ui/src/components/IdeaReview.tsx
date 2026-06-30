import { useMemo, useState } from "react";
import { Lightbulb, Hammer, Trash2, LoaderCircle } from "lucide-react";
import type { OperatorSession } from "@/types";

// The founder's door onto an ideate pause. The operator generated ideas, graded them with a separate
// bar, and STOPPED — it never decides which become work. Here you read each survivor and make the call:
// build the strong ones (each drops straight into compose_and_run, pre-wired), kill the weak ones (a kill
// is dead and the next ideation round learns the angle). Nothing builds or sends until you choose; the
// operator only resumes on the ideas you pick. This is the wall for the generate side.

type Verdict = "build" | "kill" | undefined;

export function IdeaReview({ session, onResolve }: {
  session: OperatorSession;
  onResolve: (payload: { build: string[]; kill: string[] }) => Promise<void>;
}) {
  const pending = session.pendingIdeas;
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>({});
  const [submitting, setSubmitting] = useState(false);

  const { build, kill } = useMemo(() => {
    const b: string[] = [];
    const k: string[] = [];
    for (const [id, v] of Object.entries(verdicts)) {
      if (v === "build") b.push(id);
      else if (v === "kill") k.push(id);
    }
    return { build: b, kill: k };
  }, [verdicts]);

  if (!pending) return null;
  const ideas = pending.ideas ?? [];
  const decided = build.length + kill.length;

  const set = (id: string, v: Verdict) =>
    setVerdicts((prev) => ({ ...prev, [id]: prev[id] === v ? undefined : v }));

  const submit = async () => {
    if (!decided || submitting) return;
    setSubmitting(true);
    try {
      await onResolve({ build, kill });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="idea-review">
      <div className="idea-review-head">
        <Lightbulb className="idea-review-icon" aria-hidden />
        <strong>Pick the ideas worth building</strong>
        <span className="idea-review-sub">
          Claude generated and graded these against the goal — <em>{pending.goal}</em> — and stopped for
          your call. Build the strong ones, kill the weak ones. Nothing runs until you choose.
          {pending.killedCount ? ` ${pending.killedCount} already fell below the bar.` : ""}
        </span>
      </div>

      <div className="idea-review-list" aria-label="Surviving ideas">
        {ideas.map((idea) => {
          const v = verdicts[idea.id];
          return (
            <div key={idea.id} className={`idea-card ${v ? `is-${v}` : ""}`}>
              <div className="idea-card-body">
                {idea.angle ? <span className="idea-card-angle">{idea.angle}</span> : null}
                <p className="idea-card-pitch">{idea.pitch}</p>
                {typeof idea.barScore === "number" ? (
                  <span className="idea-card-score">bar {idea.barScore.toFixed(1)}</span>
                ) : null}
              </div>
              <div className="idea-card-actions">
                <button
                  type="button"
                  className={`idea-card-btn build ${v === "build" ? "active" : ""}`}
                  onClick={() => set(idea.id, "build")}
                  aria-pressed={v === "build"}
                >
                  <Hammer size={13} /> Build
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
          {build.length} to build · {kill.length} to kill
        </span>
        <button type="button" className="idea-review-submit" disabled={!decided || submitting} onClick={() => void submit()}>
          {submitting ? <LoaderCircle size={14} className="spin" /> : null}
          {build.length ? `Build ${build.length}${kill.length ? ` · kill ${kill.length}` : ""}` : `Kill ${kill.length}`}
        </button>
      </div>
    </div>
  );
}
