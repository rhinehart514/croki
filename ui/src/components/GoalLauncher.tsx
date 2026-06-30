import { useEffect, useRef, useState } from "react";
import { ArrowUp, Lightbulb, Workflow } from "lucide-react";

// The front door — a plain-language hypothesis box, ChatGPT-style. The founder names what they want
// to LEARN; the machine reads the product, runs the experiment, and stops at the gate so nothing
// sends. This is the "watch a go-to-market machine run experiments and get smarter" vision made
// literal: a hypothesis in, a proven/disproven result out, taste sharpened each time. The example
// chips are hypotheses with a visible expected outcome so the box reads as an experiment, not a wish.

const EXAMPLE_GOALS = [
  "Does leading with our attribution blind spot beat listing features?",
  "Will founders reply more to a product teardown than a cold pitch?",
  "Does a Buffalo-local angle land better than a generic one?",
  "Which gets more yeses — a free audit or a pilot offer?",
];

export function GoalLauncher({
  productName, busy, onSubmitGoal, onIdeate, onLoadRecipe, focusSignal,
}: {
  productName: string;
  busy: boolean;
  onSubmitGoal: (goal: string) => void | Promise<void>;
  onIdeate: () => void;
  onLoadRecipe?: () => void;
  // Bumped by the host when something asks to "start a channel" while the launcher is the visible
  // composer (e.g. the New channel button). The launcher input IS that composer here, so it takes
  // the focus instead of a hidden dock.
  focusSignal?: number;
}) {
  const [goal, setGoal] = useState("");
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const submit = () => { const g = goal.trim(); if (g && !busy) void onSubmitGoal(g); };

  useEffect(() => {
    if (focusSignal) inputRef.current?.focus();
  }, [focusSignal]);

  return (
    <div className="goal-launcher">
      <div className="goal-launcher-inner">
        <span className="goal-launcher-eyebrow">{productName}</span>
        <h1 className="goal-launcher-title">What do you want to learn?</h1>
        <p className="goal-launcher-sub">
          Name a hypothesis in plain words. It reads your product, runs the experiment, and stops at
          your gate — nothing sends until you approve. Every call you make there sharpens the next run.
        </p>

        <div className="goal-launcher-box">
          <textarea
            ref={inputRef}
            className="goal-launcher-input"
            placeholder="e.g. Does leading with the attribution blind spot beat listing features?"
            value={goal}
            disabled={busy}
            onChange={(e) => setGoal(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
            rows={2}
          />
          <button className="goal-launcher-send" disabled={!goal.trim() || busy} onClick={submit} type="button" title="Start (Enter)">
            <ArrowUp size={16} />
          </button>
        </div>

        <div className="goal-launcher-examples">
          {EXAMPLE_GOALS.map((g) => (
            <button key={g} className="goal-example" disabled={busy} onClick={() => setGoal(g)} type="button">{g}</button>
          ))}
        </div>

        <div className="goal-launcher-secondary">
          <button onClick={onIdeate} disabled={busy} type="button"><Lightbulb size={13} /> Or just ideate pipelines for me</button>
          {onLoadRecipe ? (
            <button onClick={onLoadRecipe} disabled={busy} type="button"><Workflow size={13} /> Start from the pilot-outreach recipe</button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
