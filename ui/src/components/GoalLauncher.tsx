import { useState } from "react";
import { ArrowUp, Lightbulb, Workflow } from "lucide-react";

// The front door — a plain-language goal box, ChatGPT-style. The founder says what they want in
// their own words; the operator inspects the product, data, and connectors, then proposes systems.
// This is the vision's "a founder should be able to say 'Generate five qualified pilot
// conversations…'" made literal. Goal-driven, not button-driven; understandable, not an IDE you
// have to learn. Example goals span different GTM shapes so the product reads as horizontal.

const EXAMPLE_GOALS = [
  "Get 5 qualified pilot conversations without paid ads",
  "Find developers using tools like mine and draft outreach",
  "Turn my product's strengths into content that ranks",
  "Find ecosystem partners and prepare an intro",
];

export function GoalLauncher({
  productName, busy, onSubmitGoal, onIdeate, onLoadRecipe,
}: {
  productName: string;
  busy: boolean;
  onSubmitGoal: (goal: string) => void | Promise<void>;
  onIdeate: () => void;
  onLoadRecipe?: () => void;
}) {
  const [goal, setGoal] = useState("");
  const submit = () => { const g = goal.trim(); if (g && !busy) void onSubmitGoal(g); };

  return (
    <div className="goal-launcher">
      <div className="goal-launcher-inner">
        <span className="goal-launcher-eyebrow">{productName}</span>
        <h1 className="goal-launcher-title">What go-to-market outcome do you want?</h1>
        <p className="goal-launcher-sub">
          Say it in plain words. It reads your product, your data, and what's worked before, then
          proposes go-to-market systems you can run — stopping at your gate before anything is sent.
        </p>

        <div className="goal-launcher-box">
          <textarea
            className="goal-launcher-input"
            placeholder="e.g. Land 5 pilot conversations with compliance leaders this month"
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
          <button onClick={onIdeate} disabled={busy} type="button"><Lightbulb size={13} /> Or just ideate channels for me</button>
          {onLoadRecipe ? (
            <button onClick={onLoadRecipe} disabled={busy} type="button"><Workflow size={13} /> Start from the pilot-outreach recipe</button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
