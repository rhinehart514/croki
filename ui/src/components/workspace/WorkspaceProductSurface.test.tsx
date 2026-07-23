import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { createRef, useState } from "react";
import type { SystemIndex } from "@/api";
import type { MarketMovementIndex } from "@/types";
import type { ProductGtmWalkthroughStep } from "@/components/product-gtm/productGtmWorkflow";
import { WorkspaceProductSurface } from "./WorkspaceProductSurface";

const getMarketMovement = vi.fn();
const replyInConversation = vi.fn();
vi.mock("@/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api")>()),
  getMarketMovement: (...args: unknown[]) => getMarketMovement(...args),
  replyInConversation: (...args: unknown[]) => replyInConversation(...args),
}));
// The canvas itself is React Flow; step focus is plain selection state, so the surface behavior under
// test never needs a real graph render.
vi.mock("@/components/product-gtm/ProductGtmSurface", () => ({ ProductGtmSurface: () => <div data-testid="product-gtm-canvas" /> }));

const playObject = (assertion: "tentative" | "founder-asserted") => ({
  id: "play-1", objectRef: "object:play-1", name: "Founder proof loop", statement: "Turn proof into conversations.",
  type: "mechanism", territory: "gtm" as const, assertion, provenance: null, compatibilityOwned: false,
  architectureRole: null, threadRefs: [], attention: [], createdAt: null, updatedAt: null,
  properties: {
    territory: "gtm",
    workflowGraph: {
      objective: "Turn returned proof into qualified conversations",
      steps: [
        { id: "ready", label: "Proof is ready", type: "trigger" },
        { id: "prepare", label: "Prepare the story", type: "agent-work" },
        { id: "publish", label: "Publish proof", type: "external-action" },
      ],
      edges: [{ from: "ready", to: "prepare" }, { from: "prepare", to: "publish" }],
    },
  },
});
const systemIndex = (assertion: "tentative" | "founder-asserted"): SystemIndex => ({
  ventureId: "v1", revision: 1, architectureRevision: 1, scope: "system",
  objects: [playObject(assertion)], relationships: [],
  counts: { total: 1, product: 0, gtm: 1, attention: 0, matchCount: 1 },
});
const quietMovement = { ventureId: "v1", revision: 1, actions: [], modelBranches: [], liveWork: [] } as MarketMovementIndex;
// One executed act on the play: with founder-asserted assertion this derives the established register.
const ranMovement = {
  ...quietMovement,
  actions: [{ id: "act-1", state: "in-world", subjectRefs: ["object:play-1"] }],
} as unknown as MarketMovementIndex;

function Harness({ assertion, initialSelected, onFocusSpy, onWalkthroughStep = () => {}, onBeginScopedThread = () => {}, onContextualChatOpen = () => {} }: {
  assertion: "tentative" | "founder-asserted";
  initialSelected: string | null;
  onFocusSpy?: (ref: string | null) => void;
  onWalkthroughStep?: (step: ProductGtmWalkthroughStep | null) => void;
  onBeginScopedThread?: (subjectRef: string, relatedRefs?: string[]) => void;
  onContextualChatOpen?: (open: boolean) => void;
}) {
  const [selected, setSelected] = useState<string | null>(initialSelected);
  const index = systemIndex(assertion);
  return (
    <WorkspaceProductSurface
      ventureId="v1" motionProps={{}} conversation={<div />} contextualChatOpen={false}
      openerRef={createRef<HTMLElement | null>()} systemIndex={index} workIndex={null}
      selectedRef={selected} camera={null} placement={{ positions: {}, revision: 0 }}
      readOnlyReason={null} systemResource={{ data: index, status: "ready", error: null }}
      onCameraChange={() => {}} onFocus={(ref) => { onFocusSpy?.(ref); setSelected(ref); }}
      onUseAgent={() => {}} onOpenWork={() => {}} onBeginScopedThread={onBeginScopedThread}
      onNewThread={() => {}} onChanged={() => {}} onContextualChatOpen={onContextualChatOpen}
      onWalkthroughStep={onWalkthroughStep}
    />
  );
}

describe("WorkspaceProductSurface drafted-play walkthrough", () => {
  beforeEach(() => {
    getMarketMovement.mockReset().mockResolvedValue({ marketMovement: quietMovement });
    replyInConversation.mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("opens the walkthrough on a drafted play by focusing step one and its play-scoped conversation", async () => {
    const onFocusSpy = vi.fn();
    const onBeginScopedThread = vi.fn();
    const onContextualChatOpen = vi.fn();
    render(<Harness assertion="tentative" initialSelected="object:play-1" onFocusSpy={onFocusSpy} onBeginScopedThread={onBeginScopedThread} onContextualChatOpen={onContextualChatOpen} />);
    fireEvent.click(await screen.findByRole("button", { name: "Walk through this play" }));
    // Step focus IS canvas selection: the first step's exact node id, no separate walkthrough state.
    expect(onFocusSpy).toHaveBeenCalledWith("workflow:play-1:ready");
    expect(onBeginScopedThread).toHaveBeenCalledWith("object:play-1", undefined);
    expect(onContextualChatOpen).toHaveBeenCalledWith(true);
    expect(await screen.findByText("Drafted play · Step 1 of 3")).toBeInTheDocument();
  });

  it("advances and rewinds the focused step, naming it where the founder composes", async () => {
    const onWalkthroughStep = vi.fn();
    render(<Harness assertion="tentative" initialSelected="workflow:play-1:prepare" onWalkthroughStep={onWalkthroughStep} />);
    expect(await screen.findByText("Drafted play · Step 2 of 3")).toBeInTheDocument();
    expect(screen.getByText("Prepare the story")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next step" }));
    expect(await screen.findByText("Drafted play · Step 3 of 3")).toBeInTheDocument();
    expect(screen.getByText("Publish proof")).toBeInTheDocument();
    // The composer upstream receives the exact focused step so a correction carries it as subject.
    await waitFor(() => expect(onWalkthroughStep).toHaveBeenLastCalledWith(expect.objectContaining({ ref: "workflow:play-1:publish", id: "publish", position: 3 })));
    // The last step has no next; the walk stays honest instead of wrapping.
    expect(screen.getByRole("button", { name: "Next step" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Previous step" }));
    expect(await screen.findByText("Drafted play · Step 2 of 3")).toBeInTheDocument();
  });

  it("keeps an established play on Run again with no step machinery, even with a step selected", async () => {
    getMarketMovement.mockResolvedValue({ marketMovement: ranMovement });
    render(<Harness assertion="founder-asserted" initialSelected="workflow:play-1:prepare" />);
    expect(await screen.findByRole("button", { name: "Run again" })).toBeInTheDocument();
    expect(screen.getByText("Established play")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Walk through this play" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Next step" })).toBeNull();
    expect(screen.queryByText(/Step \d of \d/)).toBeNull();
  });

  it("advances focus identically under reduced motion — the step change is state, not travel", async () => {
    // Framing animation collapses to zero duration elsewhere (productGtmMotionDuration); the walkthrough
    // itself must not depend on any travel animation to change or communicate the focused step.
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} })));
    const onFocusSpy = vi.fn();
    render(<Harness assertion="tentative" initialSelected="workflow:play-1:ready" onFocusSpy={onFocusSpy} />);
    expect(await screen.findByText("Drafted play · Step 1 of 3")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next step" }));
    expect(onFocusSpy).toHaveBeenCalledWith("workflow:play-1:prepare");
    expect(await screen.findByText("Drafted play · Step 2 of 3")).toBeInTheDocument();
  });
});
