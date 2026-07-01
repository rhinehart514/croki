import { useEffect, useRef, useState } from "react";
import { ArrowUp, Lightbulb, Workflow } from "lucide-react";
import type { SharedContext } from "@/types";

// The front door — a plain-language box, ChatGPT-style. The founder names a pipeline to run;
// the machine builds it and stops at the gate so nothing sends.
//
// The framing is pipeline-first: you name (or ideate) a pipeline — a flow that moves work to your
// gate (find → draft → gate) — and build on what's already running, not on a fresh read of the
// product code. The sub-line and facts row are grounded in the current GTM SYSTEM state (how many
// pipelines exist, how many people are tracked), which is the founder's real starting point.

const CHIPS = [
  "Find operators → draft first contact",
  "Re-engage last quarter's non-replies",
  "Turn GitHub stargazers → warm intros",
  "Research 10 target accounts → draft teardowns",
];

export function GoalLauncher({
  productName, busy, onSubmitGoal, onIdeate, onLoadRecipe, focusSignal,
  peopleCount = 0, pipelineCount = 0,
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
  // Real GTM system state — never fabricated. The launcher grounds its copy in what's already
  // running (people tracked, pipelines live), not in a fresh read of the product code.
  sharedContext?: SharedContext | null;
  peopleCount?: number;
  pipelineCount?: number;
}) {
  const [goal, setGoal] = useState("");
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const submit = () => { const g = goal.trim(); if (g && !busy) void onSubmitGoal(g); };

  useEffect(() => {
    if (focusSignal) inputRef.current?.focus();
  }, [focusSignal]);

  // Ground the sub-line in the current system state: build on the pipelines you already run, or
  // start the first one. Falls back to a neutral line when there's nothing running yet.
  const sub = pipelineCount > 0
    ? "Name the next pipeline — a flow that moves work to your gate: find the people, draft the outreach, then you approve before anything sends. Build on what you already run, or start a new one."
    : "Name your first pipeline — a flow that moves work to your gate: find the people, draft the outreach, then you approve before anything sends. Say it in plain words, or start from a recipe.";

  // Grounded facts row — shown only when the numbers are real, so it reflects the live system.
  const facts: string[] = [];
  if (pipelineCount > 0) facts.push(`${pipelineCount} ${pipelineCount === 1 ? "pipeline" : "pipelines"} running`);
  if (peopleCount > 0) facts.push(`${peopleCount} ${peopleCount === 1 ? "person" : "people"} tracked`);
  const showFacts = facts.length > 0;

  return (
    <div className="goal-launcher">
      <div className="goal-launcher-inner">
        <span className="goal-launcher-eyebrow">{productName}</span>
        <h1 className="goal-launcher-title">What pipeline do you want to run?</h1>
        <p className="goal-launcher-sub">{sub}</p>
        {showFacts ? <p className="goal-launcher-grounded">{facts.join(" · ")}</p> : null}

        <div className="goal-launcher-box">
          <textarea
            ref={inputRef}
            className="goal-launcher-input"
            placeholder="e.g. Find operators, draft first contact"
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
          {CHIPS.map((g) => (
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
