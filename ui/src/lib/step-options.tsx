import { ArrowDownToLine, Code, ShieldCheck, TrendingUp } from "lucide-react";
import type { GTMNode } from "@/types";

// The hand-placeable building blocks of a GTM flow — the manual escape hatch from the vibe path,
// for when the founder knows the exact block to drop. These are deliberately the steps the Library
// and the vibe path DON'T hand you: a source seed, a deterministic transform, the safety wall, and
// attribution. Capability — your real agents and skills — comes from "Browse the library" above the
// list, never from a generic placeholder node here (a blank Agent/Skill row was just the generic the
// product exists to beat). Ordered by the flow's anatomy: bring in → transform → ship → measure. At
// four rows the order carries the anatomy on its own, so no eyebrows.
//
// "Input" collapses the three source variants (manual / csv / api) into one block: it adds a source
// node defaulting to manual, and the founder switches mode on the node via the ConnectorSelector in
// NodeEditor. "Review & stage" drops the founder gate and the staged-output node as ONE wired pair —
// staged output is an `execute` node and the wall rejects any execute without a gate upstream, so
// pairing them removes the footgun of placing the two apart (and in the wrong order).

type NodeSpec = Partial<GTMNode> & { label: string };

export type StepOption = {
  label: string;
  detail: string;
  icon: React.ReactNode;
  spec: NodeSpec;
  // Optional downstream node, auto-wired after `spec`. Used by "Review & stage" so the gate and the
  // staged-output node land already connected and the composition stays wall-valid by construction.
  then?: NodeSpec;
};

export const STEP_OPTIONS: StepOption[] = [
  { label: "Input", detail: "Rows, a file, or an API", icon: <ArrowDownToLine />, spec: { label: "Input", category: "source", connector: "manual", config: { items: [] }, contract: { emits: [] } } },
  { label: "Code", detail: "Deterministic transform", icon: <Code />, spec: { label: "Code step", category: "filter", kind: "code", ref: "transform", config: {}, contract: { accepts: [], emits: [] } } },
  {
    label: "Review & stage", detail: "Your gate, then a local queue", icon: <ShieldCheck />,
    spec: { label: "Founder review", category: "gate", connector: "default", config: {}, contract: { accepts: [], emits: ["approved", "gtmActionId"] } },
    then: { label: "Stage approved actions", category: "execute", connector: "local", config: {}, contract: { accepts: ["approved", "gtmActionId"], emits: ["gtmActionId", "executionStatus"] } },
  },
  { label: "Measure", detail: "Capture attributable outcomes", icon: <TrendingUp />, spec: { label: "Measure outcomes", category: "measure", connector: "default", config: { joinKey: "gtmActionId" }, contract: { accepts: ["gtmActionId", "source"], emits: ["attribution"] } } },
];
