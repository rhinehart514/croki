import { CheckCircle2, Code2, FileCheck2, LockKeyhole, MousePointer2, Plug, ScanSearch, ShieldCheck, Sparkles, TerminalSquare } from "lucide-react";

export const githubUrl = "https://github.com/rhinehart514/drover";
export const defaultFaqValue = ["item-0"];

export const loopSteps = [
  {
    number: "01",
    icon: ScanSearch,
    title: "Open the real repository",
    body: "Start with the codebase you already use. Croki keeps the project, worktree, selected model, and exact Thread together.",
    detail: "Exact project",
  },
  {
    number: "02",
    icon: MousePointer2,
    title: "Direct Claude or Codex",
    body: "Talk directly to the model you selected. Inspect its progress, correct the work in place, and keep the conversation as the permanent spine.",
    detail: "Native agent",
  },
  {
    number: "03",
    icon: LockKeyhole,
    title: "Review the exact change",
    body: "Diffs, files, previews, commands, and checks appear beside the Thread when they exist. Nothing is flattened into a status card or raw JSON.",
    detail: "Exact material",
  },
  {
    number: "04",
    icon: Sparkles,
    title: "See the relationships when useful",
    body: "Open Canvas when product structure, dependencies, decisions, or evidence will improve the next change. Close it without losing your place.",
    detail: "Optional Canvas",
  },
  {
    number: "05",
    icon: CheckCircle2,
    title: "Return without re-briefing",
    body: "Come back to the same Thread, model, worktree, Review, and adopted product context. The next dependent task starts better grounded.",
    detail: "Context compounds",
  },
];

export const principles = [
  {
    number: "I",
    icon: FileCheck2,
    title: "The repository stays authoritative.",
    body: "Product context cites the code, founder decisions, and exact returned evidence. A generated interpretation stays provisional until you adopt it.",
  },
  {
    number: "II",
    icon: ShieldCheck,
    title: "The selected model remains the participant.",
    body: "Each Run stays attached to its exact Thread, model, worktree, and founder direction. Croki adds continuity without replacing Claude or Codex.",
  },
  {
    number: "III",
    icon: Sparkles,
    title: "Consequential actions remain yours.",
    body: "Applying, sending, publishing, deploying, and spending stop at an exact founder-visible gate. Preparation can move quickly; authority does not move.",
  },
];

export const pricingLines = [
  {
    number: "01",
    icon: Code2,
    title: "The software",
    body: "Clone the source and run the current alpha. There is no Croki license or seat fee today.",
    detail: "$0 to Croki",
  },
  {
    number: "02",
    icon: TerminalSquare,
    title: "Your machine",
    body: "Croki's verified alpha path is the local Electron desktop app on Apple-silicon macOS. Your product and working state stay local.",
    detail: "You host it",
  },
  {
    number: "03",
    icon: Plug,
    title: "Your model",
    body: "Connect the Codex or Claude Code subscription you already pay for. The deterministic scan still runs without one.",
    detail: "Optional",
  },
];

export const faqs = [
  {
    question: "What is Croki, exactly?",
    answer:
      "Croki is a local coding environment for founders who work directly with Claude or Codex. It keeps every project, Thread, Run, exact Review, and useful product decision connected so the next change needs less explanation.",
  },
  {
    question: "How is this different from another coding-agent client?",
    answer:
      "Croki has to be just as capable and immediate for ordinary repository work. Its advantage appears across tasks: source-backed product intent, founder corrections, decisions, and evidence stay available when they materially improve the next coding Thread.",
  },
  {
    question: "What does local-first mean here?",
    answer:
      "Croki runs on your machine, works on your local repository, and uses the Claude Code or Codex subscription you already have. Project and working state stay local.",
  },
  {
    question: "Does it send things on its own?",
    answer:
      "No. Croki can research, draft, code, and prepare inside an exact Run. Every send, publish, deploy, and dollar spent stops and waits for you. You approve it, or it doesn't happen.",
  },
  {
    question: "Is this a hosted product?",
    answer:
      "No. The shipped founder product is the local Electron desktop app. Browser mode is only a development and deterministic-test harness.",
  },
];
