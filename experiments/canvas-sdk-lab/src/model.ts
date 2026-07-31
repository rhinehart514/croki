export type CanvasMode = "product" | "gtm" | "workflow" | "review";
export type CanvasSdk = "react-flow" | "tldraw" | "konva" | "excalidraw" | "cytoscape";
export type CanvasAuthority = "current" | "provisional" | "run";
export type CanvasNodeKind =
  | "intent"
  | "decision"
  | "work"
  | "evidence"
  | "audience"
  | "claim"
  | "experiment"
  | "gate";

export interface LabNode {
  readonly id: string;
  readonly kind: CanvasNodeKind;
  readonly authority: CanvasAuthority;
  readonly title: string;
  readonly body: string;
  readonly meta: string;
  readonly x: number;
  readonly y: number;
}

export interface LabEdge {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly relation: string;
}

export interface CanvasProjection {
  readonly title: string;
  readonly purpose: string;
  readonly nodes: readonly LabNode[];
  readonly edges: readonly LabEdge[];
}

const productNodes: readonly LabNode[] = [
  {
    id: "intent",
    kind: "intent",
    authority: "current",
    title: "Accumulate product understanding",
    body: "Keep intent, decisions, evidence, and consequential work durable across Threads.",
    meta: "Founder-approved intent",
    x: 70,
    y: 230,
  },
  {
    id: "thread-spine",
    kind: "decision",
    authority: "current",
    title: "Threads are the spine",
    body: "Canvas stays contextual and never becomes a second conversation or execution system.",
    meta: "Architecture decision",
    x: 390,
    y: 90,
  },
  {
    id: "native-fork",
    kind: "decision",
    authority: "current",
    title: "T3-native product fork",
    body: "Prefer native providers, worktrees, Review, terminal, preview, and project file RPCs.",
    meta: "Architecture decision",
    x: 390,
    y: 370,
  },
  {
    id: "canvas-work",
    kind: "work",
    authority: "provisional",
    title: "Spatial project model",
    body: "Render familiar projections without making graph records the founder-facing language.",
    meta: "Proposed Canvas work",
    x: 730,
    y: 90,
  },
  {
    id: "workflow-work",
    kind: "work",
    authority: "provisional",
    title: "Compose native Runs",
    body: "Arrange assignments and gates, then execute every step through ordinary Croki Threads.",
    meta: "Proposed workflow work",
    x: 730,
    y: 370,
  },
  {
    id: "evidence",
    kind: "evidence",
    authority: "current",
    title: "Exact Review and repository evidence",
    body: "Every consequential result returns to files, diffs, tests, previews, and founder authority.",
    meta: "3 repository sources",
    x: 1060,
    y: 230,
  },
];

const productEdges: readonly LabEdge[] = [
  { id: "p1", from: "thread-spine", to: "intent", relation: "implements" },
  { id: "p2", from: "native-fork", to: "intent", relation: "implements" },
  { id: "p3", from: "thread-spine", to: "canvas-work", relation: "constrains" },
  { id: "p4", from: "native-fork", to: "workflow-work", relation: "constrains" },
  { id: "p5", from: "canvas-work", to: "evidence", relation: "returns" },
  { id: "p6", from: "workflow-work", to: "evidence", relation: "returns" },
];

const gtmNodes: readonly LabNode[] = [
  {
    id: "founder",
    kind: "audience",
    authority: "current",
    title: "Founder building with agents",
    body: "Can ship code quickly but loses product and GTM reasoning across conversations.",
    meta: "Primary audience",
    x: 70,
    y: 230,
  },
  {
    id: "context-claim",
    kind: "claim",
    authority: "provisional",
    title: "Your product learns with you",
    body: "Durable product truth lets every native coding agent begin with consequential context.",
    meta: "Positioning candidate",
    x: 400,
    y: 100,
  },
  {
    id: "workflow-claim",
    kind: "claim",
    authority: "provisional",
    title: "Compose work, inspect normal Runs",
    body: "Spatial workflows add leverage without hiding the native coding environment.",
    meta: "Product claim",
    x: 400,
    y: 360,
  },
  {
    id: "founder-test",
    kind: "experiment",
    authority: "provisional",
    title: "Five-founder comprehension test",
    body: "Can a founder understand intent, active work, and evidence without Canvas instruction?",
    meta: "Awaiting interviews",
    x: 750,
    y: 100,
  },
  {
    id: "workflow-test",
    kind: "experiment",
    authority: "run",
    title: "Signup E2E workflow",
    body: "Run four native agents and measure whether execution remains legible from Canvas.",
    meta: "2 of 4 Runs complete",
    x: 750,
    y: 360,
  },
  {
    id: "gtm-evidence",
    kind: "evidence",
    authority: "current",
    title: "Founder signal",
    body: "Coding feels native today. Product and GTM strategy do not.",
    meta: "Founder observation",
    x: 1070,
    y: 230,
  },
];

const gtmEdges: readonly LabEdge[] = [
  { id: "g1", from: "founder", to: "context-claim", relation: "needs" },
  { id: "g2", from: "founder", to: "workflow-claim", relation: "needs" },
  { id: "g3", from: "context-claim", to: "founder-test", relation: "tested by" },
  { id: "g4", from: "workflow-claim", to: "workflow-test", relation: "tested by" },
  { id: "g5", from: "founder-test", to: "gtm-evidence", relation: "seeks" },
  { id: "g6", from: "workflow-test", to: "gtm-evidence", relation: "seeks" },
];

const workflowNodes: readonly LabNode[] = [
  {
    id: "scope",
    kind: "work",
    authority: "run",
    title: "Define signup contract",
    body: "Agent reads current product truth and produces explicit journey checkpoints.",
    meta: "Complete · Thread 142",
    x: 60,
    y: 230,
  },
  {
    id: "signup",
    kind: "work",
    authority: "run",
    title: "Test signup",
    body: "Inspect account creation, validation, and first workspace transition.",
    meta: "Running · Codex",
    x: 380,
    y: 50,
  },
  {
    id: "billing",
    kind: "work",
    authority: "run",
    title: "Test billing",
    body: "Verify checkout, cancellation, and degraded payment paths.",
    meta: "Waiting · Claude",
    x: 380,
    y: 220,
  },
  {
    id: "recovery",
    kind: "work",
    authority: "run",
    title: "Test recovery",
    body: "Verify password recovery and abandoned signup re-entry.",
    meta: "Complete · Codex",
    x: 380,
    y: 390,
  },
  {
    id: "synthesize",
    kind: "work",
    authority: "run",
    title: "Synthesize evidence",
    body: "A normal Croki Run reads returned evidence and prepares one exact Review.",
    meta: "Blocked by billing",
    x: 730,
    y: 230,
  },
  {
    id: "founder-gate",
    kind: "gate",
    authority: "provisional",
    title: "Founder Review",
    body: "Inspect diffs, previews, tests, claims, and proposed context changes before adoption.",
    meta: "Authority gate",
    x: 1060,
    y: 230,
  },
];

const workflowEdges: readonly LabEdge[] = [
  { id: "w1", from: "scope", to: "signup", relation: "opens Run" },
  { id: "w2", from: "scope", to: "billing", relation: "opens Run" },
  { id: "w3", from: "scope", to: "recovery", relation: "opens Run" },
  { id: "w4", from: "signup", to: "synthesize", relation: "returns" },
  { id: "w5", from: "billing", to: "synthesize", relation: "returns" },
  { id: "w6", from: "recovery", to: "synthesize", relation: "returns" },
  { id: "w7", from: "synthesize", to: "founder-gate", relation: "requests" },
];

const reviewNodes = productNodes.map(
  (node, index): LabNode => ({
    ...node,
    x: 90 + (index % 3) * 420,
    y: 90 + Math.floor(index / 3) * 290,
  }),
);

export const projections: Readonly<Record<CanvasMode, CanvasProjection>> = {
  product: {
    title: "Project understanding",
    purpose: "Intent, decisions, work, and evidence as one repository-owned model.",
    nodes: productNodes,
    edges: productEdges,
  },
  gtm: {
    title: "Founder GTM reasoning",
    purpose: "Audience, claims, experiments, and evidence without leaving the coding environment.",
    nodes: gtmNodes,
    edges: gtmEdges,
  },
  workflow: {
    title: "Native Run workflow",
    purpose: "Composition on Canvas, execution and inspection through ordinary Croki Threads.",
    nodes: workflowNodes,
    edges: workflowEdges,
  },
  review: {
    title: "Founder Review",
    purpose:
      "Current truth stays stable while provisional work is inspected and selectively adopted.",
    nodes: reviewNodes,
    edges: productEdges,
  },
};

export const sdkDetails: Readonly<
  Record<
    CanvasSdk,
    { readonly label: string; readonly description: string; readonly consequence: string }
  >
> = {
  "react-flow": {
    label: "React Flow",
    description: "Semantic React nodes with restrained graph interactions.",
    consequence: "Closest to Croki's model. The SDK can disappear behind selection and projection.",
  },
  tldraw: {
    label: "tldraw",
    description: "A complete infinite whiteboard with native shape tools.",
    consequence:
      "Most expressive. Also introduces the strongest second-product and licensing gravity.",
  },
  konva: {
    label: "Konva",
    description: "A custom-rendered scene with precise spatial control.",
    consequence:
      "Visually unconstrained. Croki must own selection, input, layout, and accessibility.",
  },
  excalidraw: {
    label: "Excalidraw",
    description: "A founder-friendly sketch surface with informal diagram language.",
    consequence:
      "Excellent for thinking aloud. Weakest boundary between canonical truth and sketch.",
  },
  cytoscape: {
    label: "Cytoscape",
    description: "A graph-native renderer optimized for connected systems.",
    consequence: "Strong for dependency inspection. Less natural for rich authoring and inputs.",
  },
};

export const canvasModes: readonly { readonly id: CanvasMode; readonly label: string }[] = [
  { id: "product", label: "Product" },
  { id: "gtm", label: "GTM" },
  { id: "workflow", label: "Workflow" },
  { id: "review", label: "Review" },
];

export const canvasSdks: readonly CanvasSdk[] = [
  "react-flow",
  "tldraw",
  "konva",
  "excalidraw",
  "cytoscape",
];
