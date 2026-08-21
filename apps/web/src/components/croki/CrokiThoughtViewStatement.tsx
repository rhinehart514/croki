import type { CrokiThoughtViewStatement } from "@croki/contracts";
import { ArrowUpRight } from "lucide-react";

const EPISTEMIC_LABEL: Record<CrokiThoughtViewStatement["epistemicState"], string> = {
  observed: "Observed",
  attributed: "Attributed",
  derived: "Derived",
  inferred: "Inferred",
  hypothetical: "Hypothetical",
  contradicted: "Contradicted",
  uncovered: "Not in sources",
};

const EPISTEMIC_TONE: Record<CrokiThoughtViewStatement["epistemicState"], string> = {
  observed: "border-zinc-500 text-zinc-400",
  attributed: "border-cyan-500/70 text-cyan-300",
  derived: "border-blue-500/70 text-blue-300",
  inferred: "border-violet-500/70 text-violet-300",
  hypothetical: "border-amber-400/80 text-amber-300",
  contradicted: "border-rose-500/80 text-rose-300",
  uncovered: "border-dashed border-zinc-600 text-zinc-500",
};

export function CrokiThoughtViewStatementItem(props: {
  readonly statement: CrokiThoughtViewStatement;
  readonly selected: boolean;
  readonly onSelect: (statement: CrokiThoughtViewStatement) => void;
}) {
  const tone = EPISTEMIC_TONE[props.statement.epistemicState];
  return (
    <button
      type="button"
      className={`group relative w-full border-l-2 bg-white/[0.025] px-4 py-3.5 text-left outline-none transition-colors hover:bg-white/[0.05] focus-visible:ring-1 focus-visible:ring-white ${tone} ${
        props.selected ? "bg-white/[0.08] ring-1 ring-white/50" : ""
      }`}
      aria-pressed={props.selected}
      onClick={() => props.onSelect(props.statement)}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-medium uppercase tracking-[0.14em] text-current">
            {EPISTEMIC_LABEL[props.statement.epistemicState]}
          </p>
          <h3 className="mt-1.5 text-[13px] leading-5 font-medium text-zinc-100">
            {props.statement.title}
          </h3>
          {props.statement.body ? (
            <p className="mt-1.5 line-clamp-3 text-[11px] leading-[1.55] text-zinc-500">
              {props.statement.body}
            </p>
          ) : null}
        </div>
        <ArrowUpRight
          className="mt-0.5 size-3 shrink-0 text-zinc-700 transition-colors group-hover:text-zinc-400"
          aria-hidden
        />
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 text-[9px] uppercase tracking-[0.1em] text-zinc-700">
        <span className="truncate">{props.statement.kind}</span>
        <span>r{props.statement.revision}</span>
      </div>
    </button>
  );
}
