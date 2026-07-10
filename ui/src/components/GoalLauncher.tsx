import { useEffect, useRef, useState } from "react";
import { ArrowUp, Lightbulb } from "lucide-react";
import type { SharedContext } from "@/types";
import { AgentPicker } from "@/components/AgentPicker";
import { DEFAULT_MODEL } from "@/components/agent-picker-models";

// The front door — a plain-language box, deliberately AMBIGUOUS about altitude. The founder says
// whatever they're actually wondering: an ICP question, a positioning doubt, a draft they need, a
// measurement gap, or a whole pipeline. The operator — running on the founder's own AI runtime
// (their subscription, skills, agents, fan-out research) — decides what shape the work takes: ideate
// and pause for verdicts, research and report, or compose a pipeline that stops at the gate. Nothing
// sends without the founder. The box never forces the pipeline frame; a pipeline is one possible
// answer, not the question.
//
// The runtime is the founder's choice, not ours: the same compact model picker ComposerDock uses is
// embedded in the input here, reading and writing the shared `gtm.model` local choice. So a founder on
// Codex can deliberately pick Codex for their very FIRST run instead of being silently defaulted to
// Claude. The chosen model rides BOTH first-run actions (submit and Ideate) up to createOperatorSession.

// The quick-starts teach ALTITUDE, not templates. Each one is a plain-words goal at the right height
// — a commercial outcome the founder actually wants — so a first-timer learns what to aim the box at.
// Clicking one only seeds the box; the founder edits it or types anything else, and Claude generates
// the expert structure (goal, bet, move, why, do-today, what to measure) from whatever they land on.
// They deliberately span motions — money now, calls, segment, offer, recovery, a small run — so no
// single motion is the enshrined answer.
const ALTITUDE_MODES = [
  "Get money this week",
  "Book buyer calls",
  "Find the first real customer segment",
  "Sharpen the offer",
  "Recover stalled leads",
  "Launch a small GTM run",
];

export function GoalLauncher({
  productName, busy, onSubmitGoal, onIdeate, focusSignal,
  peopleCount = 0, pipelineCount = 0,
}: {
  productName: string;
  busy: boolean;
  // Both first-run actions carry the founder's selected runtime model, so an explicit Codex (or Claude)
  // choice is honored on the very first session — not just from the second turn in ComposerDock onward.
  onSubmitGoal: (goal: string, model: string) => void | Promise<void>;
  onIdeate: (model: string) => void;
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
  // The persisted runtime choice, shared with ComposerDock via the `gtm.model` local key so the founder
  // sets it once and it holds across the first run and every turn after. Falls back to DEFAULT_MODEL.
  const [model, setModel] = useState<string>(
    () => (typeof localStorage !== "undefined" && localStorage.getItem("gtm.model")) || DEFAULT_MODEL);
  const pickModel = (id: string) => { setModel(id); try { localStorage.setItem("gtm.model", id); } catch { /* private mode */ } };
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const submit = () => { const g = goal.trim(); if (g && !busy) void onSubmitGoal(g, model); };

  useEffect(() => {
    if (focusSignal) inputRef.current?.focus();
  }, [focusSignal]);

  const beginning = pipelineCount === 0;
  const chips = ALTITUDE_MODES;

  // Ground the sub-line in the current system state. Either way the promise is the same: any
  // altitude in, the right shape of work out, every outward step stopping at the founder.
  const sub = beginning
    ? "Say it in plain words — which customers to chase, what to test first, what to charge, or a small run to launch. Your AI runtime works it with your skills and agents, and stops wherever your call is needed. Nothing sends without you."
    : "Any altitude — question what's working, sharpen the offer, or launch the next move. Your AI runtime works it with your skills and agents and stops at your gate. Nothing sends without you.";

  // Grounded facts row — shown only when the numbers are real, so it reflects the live system.
  const facts: string[] = [];
  if (pipelineCount > 0) facts.push(`${pipelineCount} ${pipelineCount === 1 ? "pipeline" : "pipelines"} running`);
  if (peopleCount > 0) facts.push(`${peopleCount} ${peopleCount === 1 ? "person" : "people"} tracked`);
  const showFacts = facts.length > 0;

  return (
    <div className="goal-launcher">
      <div className="goal-launcher-inner">
        <span className="goal-launcher-eyebrow">{productName}</span>
        <h1 className="goal-launcher-title">What are you trying to make happen?</h1>
        <p className="goal-launcher-sub">{sub}</p>
        {showFacts ? <p className="goal-launcher-grounded">{facts.join(" · ")}</p> : null}

        <div className="goal-launcher-box">
          <textarea
            ref={inputRef}
            className="goal-launcher-input"
            placeholder={beginning ? "e.g. Get the first paying customer this week" : "e.g. What's working — and what should we do next?"}
            value={goal}
            disabled={busy}
            onChange={(e) => setGoal(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
            rows={2}
          />
          <div className="goal-launcher-controls">
            {/* One calm control, embedded in the input — the founder's runtime choice, not a setup step. */}
            <AgentPicker value={model} onChange={pickModel} />
            <button className="goal-launcher-send" disabled={!goal.trim() || busy} onClick={submit} type="button" title="Start (Enter)">
              <ArrowUp size={16} />
            </button>
          </div>
        </div>

        <div className="goal-launcher-examples">
          {chips.map((g) => (
            <button key={g} className="goal-example" disabled={busy} onClick={() => setGoal(g)} type="button">{g}</button>
          ))}
        </div>

        <div className="goal-launcher-secondary">
          <button onClick={() => onIdeate(model)} disabled={busy} type="button">
            <Lightbulb size={13} /> {beginning ? "Ideate directions for me" : "Ideate what's next for me"}
          </button>
        </div>
      </div>
    </div>
  );
}
