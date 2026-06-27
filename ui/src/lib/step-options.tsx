import { Bot, Code, Database, FileSpreadsheet, Globe2, ShieldCheck, TrendingUp, Wand2, Zap } from "lucide-react";
import type { GTMNode } from "@/types";

// The hand-placeable building blocks of a GTM flow — a source (manual/csv/api), the open capability
// kinds (agent/skill/code), and the spine (gate/output/measure). Shared so the add menu can live
// wherever it makes sense (now: the command dock's "+", not a separate canvas "Add step").
export type StepOption = {
  label: string;
  detail: string;
  icon: React.ReactNode;
  spec: Partial<GTMNode> & { label: string };
};

export const STEP_OPTIONS: StepOption[] = [
  { label: "Manual input", detail: "Paste or enter rows", icon: <Database />, spec: { label: "Manual input", category: "source", connector: "manual", config: { items: [] }, contract: { emits: [] } } },
  { label: "CSV input", detail: "Import tabular data", icon: <FileSpreadsheet />, spec: { label: "CSV input", category: "source", connector: "csv", config: { csv: "" }, contract: { emits: [] } } },
  { label: "API input", detail: "Pull JSON records", icon: <Globe2 />, spec: { label: "API input", category: "source", connector: "api", config: { endpoint: "" }, contract: { emits: [] } } },
  { label: "Agent", detail: "Claude or Codex judgment", icon: <Bot />, spec: { label: "Agent step", category: "generate", kind: "agent", ref: "gtm-enrich", config: {}, contract: { accepts: [], emits: [] } } },
  { label: "Skill", detail: "Reusable working method", icon: <Wand2 />, spec: { label: "Skill step", category: "generate", kind: "skill", ref: "positioning", config: {}, contract: { accepts: [], emits: [] } } },
  { label: "Code", detail: "Deterministic transform", icon: <Code />, spec: { label: "Code step", category: "filter", kind: "code", ref: "transform", config: {}, contract: { accepts: [], emits: [] } } },
  { label: "Founder gate", detail: "Review before outside action", icon: <ShieldCheck />, spec: { label: "Founder review", category: "gate", connector: "default", config: {}, contract: { accepts: [], emits: ["approved", "gtmActionId"] } } },
  { label: "Staged output", detail: "Local queue, never auto-send", icon: <Zap />, spec: { label: "Stage approved actions", category: "execute", connector: "local", config: {}, contract: { accepts: ["approved", "gtmActionId"], emits: ["gtmActionId", "executionStatus"] } } },
  { label: "Measure", detail: "Capture attributable outcomes", icon: <TrendingUp />, spec: { label: "Measure outcomes", category: "measure", connector: "default", config: { joinKey: "gtmActionId" }, contract: { accepts: ["gtmActionId", "source"], emits: ["attribution"] } } },
];
