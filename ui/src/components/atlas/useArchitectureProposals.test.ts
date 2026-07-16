import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  acceptArchitectureSystemProposal,
  decideArchitectureProposal,
  listArchitectureProposals,
} from "@/api";
import type {
  FirmArchitectureDocument,
  FirmArchitectureProposal,
  FirmArchitectureProposalDecisionResponse,
  FirmArchitectureSystemAcceptanceResponse,
  FirmWorkingTheoryProposalRecord,
} from "@/types";
import { useArchitectureProposals } from "./useArchitectureProposals";

vi.mock("@/api", () => ({
  acceptArchitectureSystemProposal: vi.fn(),
  decideArchitectureProposal: vi.fn(),
  listArchitectureProposals: vi.fn(),
}));

const listMock = vi.mocked(listArchitectureProposals);
const decideMock = vi.mocked(decideArchitectureProposal);
const acceptSystemMock = vi.mocked(acceptArchitectureSystemProposal);

const architecture: FirmArchitectureDocument = {
  schemaVersion: 1,
  ventureId: "venture-1",
  revision: 4,
  intent: { statement: "Turn proof into demand" },
  elements: [],
  connections: [],
  groups: [],
  evidenceAnnotations: [],
};

const pendingProposal: FirmArchitectureProposal = {
  id: "proposal-1",
  ventureId: "venture-1",
  baseRevision: 4,
  intent: "Preserve a possible door",
  operations: [{
    op: "create-element",
    element: { id: "concept-door", role: "concept", name: "Possible door" },
  }],
  affectedExecutionContexts: [],
  evidenceRefs: [],
  unresolvedAssumptions: ["Audience is not confirmed."],
  expectedExecutionEffect: "Descriptive context only.",
  proposedBy: { authority: "agent", id: "operator" },
  configurationRevision: 3,
  status: "pending",
  createdAt: "2026-07-15T12:00:00.000Z",
  decidedAt: null,
  decision: null,
};

const workingTheory: FirmWorkingTheoryProposalRecord = {
  id: "theory-1",
  ventureId: "venture-1",
  mode: "working-theory",
  status: "current",
  supersedes: null,
  baseRevision: 4,
  intent: "A provisional read",
  subjects: [],
  relationships: [],
  anchors: [],
  sources: [],
  conversationRefs: [],
  createdAt: "2026-07-15T11:59:00.000Z",
  proposedBy: { authority: "agent", id: "operator" },
};

function acceptedResponse(): FirmArchitectureProposalDecisionResponse {
  const accepted = {
    ...pendingProposal,
    status: "accepted" as const,
    decision: "accept" as const,
    decidedAt: "2026-07-15T12:05:00.000Z",
    appliedRevision: 5,
  };
  return {
    proposal: accepted,
    architecture: { ...architecture, revision: 5 },
    revision: 5,
    receipt: {
      id: "architecture-revision-5",
      revision: 5,
      baseRevision: 4,
      actor: { authority: "founder", id: "founder" },
      source: "proposal-acceptance",
      proposalId: accepted.id,
      reason: accepted.intent,
      operations: accepted.operations,
      affectedTargets: ["concept-door"],
      createdAt: accepted.decidedAt,
    },
    staleDrives: [],
  };
}

const systemProposal: FirmArchitectureProposal = {
  ...pendingProposal,
  id: "proposal-system",
  intent: "Stage a governed outbound campaign",
  operations: [{
    op: "create-element",
    element: {
      id: "campaign-outbound",
      role: "campaign",
      name: "Outbound proof",
      audience: "Design-led founders",
      objective: "Learn whether the opening earns a reply",
      primaryMotionId: "motion-outbound",
      motionIds: ["motion-outbound"],
      governingBetSeed: "A grounded opening earns a useful reply",
      supportingBetIds: [],
      measurement: { observation: "Relevant reply", window: "Within fourteen days" },
    },
  }],
};

function acceptedSystemResponse(): FirmArchitectureSystemAcceptanceResponse {
  const base = acceptedResponse();
  return {
    ...base,
    proposal: {
      ...systemProposal,
      status: "accepted",
      decision: "accept",
      decidedAt: "2026-07-15T12:05:00.000Z",
      appliedRevision: 5,
    },
    bets: [],
    campaigns: [],
    atomicity: "compensated-acceptance",
  };
}

describe("useArchitectureProposals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listMock.mockResolvedValue({ proposals: [pendingProposal], revision: 4 });
    decideMock.mockResolvedValue(acceptedResponse());
    acceptSystemMock.mockResolvedValue(acceptedSystemResponse());
  });

  it("polls pending proposals and projects their honest review state", async () => {
    const { result, unmount } = renderHook(() => useArchitectureProposals(
      "venture-1",
      { baseArchitecture: architecture, pollMs: 60_000 },
    ));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.pending).toHaveLength(1);
    expect(result.current.pending[0]).toMatchObject({ pending: true, stale: false, canDecide: true });
    expect(result.current.pending[0]?.scene.elements[0]?.name).toBe("Possible door");
    unmount();
  });

  it("keeps working theories in the inline venture view instead of structural review", async () => {
    listMock.mockResolvedValueOnce({ proposals: [workingTheory, pendingProposal], revision: 4 });
    const { result, unmount } = renderHook(() => useArchitectureProposals(
      "venture-1",
      { baseArchitecture: architecture, pollMs: 60_000 },
    ));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.proposals).toHaveLength(1);
    expect(result.current.proposals[0]?.proposal.id).toBe("proposal-1");
    await expect(result.current.decide("theory-1", { decision: "accept" })).rejects.toThrow(/corrected in the venture view/i);
    expect(decideMock).not.toHaveBeenCalled();
    unmount();
  });

  it("adopts the decision response without waiting for another poll", async () => {
    const { result, unmount } = renderHook(() => useArchitectureProposals(
      "venture-1",
      { baseArchitecture: architecture, pollMs: 60_000 },
    ));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.decide("proposal-1", { decision: "accept" });
    });

    expect(decideMock).toHaveBeenCalledWith("venture-1", "proposal-1", { decision: "accept" });
    expect(acceptSystemMock).not.toHaveBeenCalled();
    expect(result.current.revision).toBe(5);
    expect(result.current.pending).toHaveLength(0);
    expect(result.current.proposals[0]?.decisionBlock).toBe("settled");
    unmount();
  });

  it("accepts a governing-bet seed through compensated system acceptance", async () => {
    listMock.mockResolvedValueOnce({ proposals: [systemProposal], revision: 4 });
    const { result, unmount } = renderHook(() => useArchitectureProposals(
      "venture-1",
      { baseArchitecture: architecture, pollMs: 60_000 },
    ));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.decide("proposal-system", { decision: "accept", reason: "Accept the governed system" });
    });

    expect(acceptSystemMock).toHaveBeenCalledWith("venture-1", "proposal-system", "Accept the governed system");
    expect(decideMock).not.toHaveBeenCalled();
    expect(result.current.pending).toHaveLength(0);
    unmount();
  });

  it("refuses stale and read-only decisions before calling the founder route", async () => {
    listMock.mockResolvedValueOnce({ proposals: [pendingProposal], revision: 5 });
    const stale = renderHook(() => useArchitectureProposals("venture-1", { pollMs: 60_000 }));
    await waitFor(() => expect(stale.result.current.loading).toBe(false));
    await expect(stale.result.current.decide("proposal-1", { decision: "accept" })).rejects.toThrow(/earlier venture revision/i);
    stale.unmount();

    listMock.mockResolvedValueOnce({ proposals: [pendingProposal], revision: 4 });
    const readOnly = renderHook(() => useArchitectureProposals("venture-1", { readOnly: true, pollMs: 60_000 }));
    await waitFor(() => expect(readOnly.result.current.loading).toBe(false));
    await expect(readOnly.result.current.decide("proposal-1", { decision: "reject" })).rejects.toThrow(/cannot decide/i);
    readOnly.unmount();

    expect(decideMock).not.toHaveBeenCalled();
  });

  it("keeps the last good proposal scene when a later poll fails", async () => {
    const { result, unmount } = renderHook(() => useArchitectureProposals("venture-1", { pollMs: 60_000 }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    listMock.mockRejectedValueOnce(new Error("brain unavailable"));

    act(() => result.current.reload());
    await waitFor(() => expect(result.current.error).toBe("brain unavailable"));

    expect(result.current.proposals).toHaveLength(1);
    expect(result.current.proposals[0]?.proposal.id).toBe("proposal-1");
    unmount();
  });
});
