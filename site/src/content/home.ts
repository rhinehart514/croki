import { CheckCircle2, Code2, FileCheck2, LockKeyhole, MousePointer2, Plug, ScanSearch, ShieldCheck, Sparkles, TerminalSquare } from "lucide-react";

export const githubUrl = "https://github.com/rhinehart514/drover";
export const defaultFaqValue = ["item-0"];

export const loopSteps = [
  {
    number: "01",
    icon: ScanSearch,
    title: "Bring what you shipped",
    body: "Point Croki at the real repo you build with Claude or Codex. It reads the actual product you made, not a description of it.",
    detail: "Real product",
  },
  {
    number: "02",
    icon: MousePointer2,
    title: "Find who it's for",
    body: "Croki drafts one grounded way to reach real users of this specific product. Outreach, a landing cut, a post. Not a generic growth checklist.",
    detail: "Grounded, not generic",
  },
  {
    number: "03",
    icon: LockKeyhole,
    title: "Nothing leaves without you",
    body: "Every message, deploy, and publish stops at your hand. You see exactly what goes where, and to whom, before it goes.",
    detail: "You decide",
  },
  {
    number: "04",
    icon: Sparkles,
    title: "See what came back",
    body: "Replies and real usage return as signal you can act on. Who did what, in their own words, one click away.",
    detail: "Real signal",
  },
  {
    number: "05",
    icon: CheckCircle2,
    title: "Ship the next thing",
    body: "What you learn becomes the next change to the product, and Croki helps you build it, back where you started.",
    detail: "Back to build",
  },
];

export const principles = [
  {
    number: "I",
    icon: FileCheck2,
    title: "Every claim traces back to something real.",
    body: "Outreach and posts are grounded in your actual product and what users actually did. A guess is always marked as a guess.",
  },
  {
    number: "II",
    icon: ShieldCheck,
    title: "The agent keeps working. You stay in control.",
    body: "Give one direction and Croki can keep the safe work moving, even across a restart, without ever sending or spending on its own.",
  },
  {
    number: "III",
    icon: Sparkles,
    title: "Nothing reaches the world without your say-so.",
    body: "Research and drafts move fast. Sending, publishing, deploying, and spending stop and wait for your call, every time.",
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
      "Croki is where the app you already built gets its first real users. It reads your actual repo, drafts grounded ways to reach the people it's for, sends only what you approve, and brings back what they do so you know what to build next. The build tools stop at 'it's live.' Croki starts there.",
  },
  {
    question: "How is this different from Lovable, Bolt, or Replit?",
    answer:
      "Those get you to a live app. Croki assumes you already have one. Your problem was never building it, it's that nobody's using it yet. Croki works on your real Claude or Codex repo and owns the part after launch: reaching users, keeping it trustworthy in front of them, and turning what comes back into your next move.",
  },
  {
    question: "What does local-first mean here?",
    answer:
      "Croki runs on your machine. Your product, your repo, and the people you reach stay with you. It works on your local repository and uses the model subscription you already have.",
  },
  {
    question: "Does it send things on its own?",
    answer:
      "No. One direction lets Croki keep the safe work moving, research, drafting, preparing, even after a restart. Every send, publish, deploy, and dollar spent stops and waits for you. You approve it, or it doesn't happen.",
  },
  {
    question: "Is this a hosted product?",
    answer:
      "No. The shipped founder product is the local Electron desktop app. Browser mode is only a development and deterministic-test harness.",
  },
];
