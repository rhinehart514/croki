import { useMemo, useState } from "react";
import { Lightbulb, Hammer, Trash2, LoaderCircle, Compass, ChevronDown, ChevronUp, Undo2 } from "lucide-react";
import type { OperatorSession, PendingIdea } from "@/types";

// The founder's door onto an ideate pause. The operator generated ideas, had a separate check grade
// them against what the goal needs, and STOPPED — it never decides which become work. Each card is a
// decidable pitch: the idea in plain words, the strongest reason it could work for this goal, and the
// strongest reason it might not. Ideas that were cut before reaching the founder stay one tap away,
// each with the plain reason it was cut, and any of them can be brought back and built — the founder's
// call beats the check's. Two stages, set by where the project is in its life: "directions" (a
// project's beginning) keeps ideas as starting directions with nothing composed yet; "build" (a
// mature project) composes kept ideas into pipelines that stop at the founder's gate.

type Verdict = "build" | "kill" | undefined;

// A cut idea in the pause payload: the pitch, what kind of move it is, and the plain reason it was
// set aside. Mirrors OperatorSession.pendingIdeas.cut in types.ts.
type CutIdea = { id: string; pitch: string; what?: string | null; reason?: string | null };

// Ideas often lead with a segment ("Home services: …"). Split that prefix into a scannable title so
// the card reads as a decision, not a paragraph. Fallback: first clause.
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
  const [revivedIds, setRevivedIds] = useState<string[]>([]);
  const [showCut, setShowCut] = useState(false);
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

  const cut = useMemo<CutIdea[]>(() => pending?.cut ?? [], [pending]);

  // The deck the founder decides on: the ideas that cleared the check (strongest first — ordered,
  // never numbered) plus any cut idea the founder brought back.
  const ideas = useMemo<PendingIdea[]>(() => {
    const list = [...(pending?.ideas ?? [])];
    list.sort((a, b) => (b.barScore ?? 0) - (a.barScore ?? 0));
    for (const id of revivedIds) {
      const entry = cut.find((c) => c.id === id);
      // A revived idea carries the reason it was cut as its honest "might not" line.
      if (entry) list.push({ id: entry.id, pitch: entry.pitch, what: entry.what ?? null, risk: entry.reason ?? null });
    }
    return list;
  }, [pending, cut, revivedIds]);

  if (!pending) return null;
  const decided = build.length + kill.length;
  const keepLabel = directions ? "Keep" : "Build";
  const KeepIcon = directions ? Compass : Hammer;
  const stillCut = cut.filter((c) => !revivedIds.includes(c.id));

  const set = (id: string, v: Verdict) =>
    setVerdicts((prev) => ({ ...prev, [id]: prev[id] === v ? undefined : v }));

  const revive = (id: string) => {
    setRevivedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  };

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
            ? "This project is just starting. What you keep is saved as a starting direction — nothing runs yet, and you'll get back the cheapest way to test it."
            : "What you keep gets built into work that stops at your gate."}
          {" "}What you kill stays killed and won't come back next round.
        </span>
      </div>

      <div className="idea-review-list" aria-label="Ideas waiting for your call">
        {ideas.map((idea) => {
          const v = verdicts[idea.id];
          const { title, rest } = splitPitch(idea.pitch);
          return (
            <div key={idea.id} className={`idea-card ${v ? `is-${v}` : ""}`}>
              <div className="idea-card-body">
                <div className="idea-card-top">
                  <strong className="idea-card-title">{title}</strong>
                </div>
                {idea.what ? <span className="idea-card-angle">{idea.what}</span> : null}
                <p className="idea-card-pitch">{rest}</p>
                {idea.upside ? (
                  <p className="idea-card-pitch"><strong>Why it could work:</strong> {idea.upside}</p>
                ) : null}
                {idea.risk ? (
                  <p className="idea-card-pitch"><strong>Why it might not:</strong> {idea.risk}</p>
                ) : null}
                {idea.take ? (
                  <p className="idea-card-pitch"><strong>The check's read:</strong> {idea.take}</p>
                ) : null}
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

      {stillCut.length ? (
        <div className="idea-review-list" aria-label="Ideas set aside before they reached you">
          <button
            type="button"
            className="idea-card-more"
            onClick={() => setShowCut((open) => !open)}
            aria-expanded={showCut}
          >
            {showCut ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {stillCut.length === 1
              ? "1 idea was set aside before it reached you — see why"
              : `${stillCut.length} ideas were set aside before they reached you — see why`}
          </button>
          {showCut ? stillCut.map((entry) => (
            <div key={entry.id} className="idea-card is-kill">
              <div className="idea-card-body">
                <p className="idea-card-pitch">{entry.pitch}</p>
                <p className="idea-card-pitch"><strong>Why it was cut:</strong> {entry.reason || "Fell short of what this goal needs."}</p>
              </div>
              <div className="idea-card-actions">
                <button type="button" className="idea-card-btn build" onClick={() => revive(entry.id)}>
                  <Undo2 size={13} /> Bring it back
                </button>
              </div>
            </div>
          )) : null}
        </div>
      ) : null}

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
