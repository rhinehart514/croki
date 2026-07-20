import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ReleaseDetail } from "@/api";
import { ReleaseObservation } from "./ReleaseObservation";

const release = (decisions: Array<Record<string, unknown>> = [], observations: ReleaseDetail["observations"] = []): ReleaseDetail => ({
  id: "release-one", releaseRef: "object:release-one", name: "Release one", statement: "", lifecycle: "in-market", attention: [], updatedAt: null, createdAt: null, endedAt: null, endedBy: null,
  relatedObjectRefs: [], threadRefs: [], runRefs: [], decisions, outcomes: [], observations, relationships: [], externalRefs: {}, revision: 1,
});

const props = { readOnlyReason: null, onGrant: vi.fn(async () => {}), onCheck: vi.fn(async () => {}), onRevoke: vi.fn(async () => {}), onReconnect: vi.fn() };

describe("ReleaseObservation", () => {
  it("is visibly unavailable until an exact real Gmail send exists", () => {
    render(<ReleaseObservation {...props} release={release()} />);
    expect(screen.getByText("Release one real Gmail action first. Observation cannot infer a source.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Authorize observation" })).toBeDisabled();
  });

  it("grants a bounded source and renders active read-only authority", async () => {
    const onGrant = vi.fn(async () => {});
    const sent = [{ id: "decision-one", releasedAt: "2026-07-20T12:00:00.000Z", executionResult: { messageId: "gmail-one" } }];
    const { rerender } = render(<ReleaseObservation {...props} release={release(sent)} onGrant={onGrant} />);
    fireEvent.click(screen.getByRole("button", { name: "Authorize observation" }));
    await waitFor(() => expect(onGrant).toHaveBeenCalledWith(expect.objectContaining({ source: "gmail", returnConditions: [expect.stringContaining("reply")] })));
    const contract = { id: "observation-one", type: "observation-contract" as const, releaseRef: "object:release-one", source: "gmail" as const, purpose: "Capture replies", startsAt: "2026-07-20T00:00:00.000Z", endsAt: "2099-07-20T00:00:00.000Z", returnConditions: ["reply", "objection"], messageIds: ["gmail-one"], decisionRefs: ["decision:decision-one"], grantedAt: "2026-07-20T00:00:00.000Z", grantedBy: "founder", revokedAt: null, lastCheckedAt: null, lastResult: null };
    rerender(<ReleaseObservation {...props} release={release(sent, [contract])} />);
    expect(screen.getByText(/Gmail · 1 exact sent message/)).toBeInTheDocument();
    expect(screen.getByText(/no sends, spend, or interpretation changes/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check now" })).toBeEnabled();
  });
});
