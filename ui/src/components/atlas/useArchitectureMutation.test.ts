import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mutateArchitecture } from "@/api";
import { useArchitectureMutation } from "./useArchitectureMutation";

vi.mock("@/api", () => ({ mutateArchitecture: vi.fn() }));

const mutateMock = vi.mocked(mutateArchitecture);

describe("useArchitectureMutation", () => {
  beforeEach(() => mutateMock.mockReset());

  it("uses the returned revision for an immediate sequential mutation", async () => {
    mutateMock
      .mockResolvedValueOnce({ architecture: {} as never, revision: 5, receipt: {}, affectedContexts: [] })
      .mockResolvedValueOnce({ architecture: {} as never, revision: 6, receipt: {}, affectedContexts: [] });
    const { result } = renderHook(() => useArchitectureMutation({ ventureId: "venture-1", revision: 4 }));

    await act(async () => {
      await result.current.apply([{ op: "change-role", elementId: "thought-1", role: "system" }], "Promote thought");
      await result.current.apply([{ op: "create-element", element: { id: "thought-2" } }], "Place thought");
    });

    expect(mutateMock.mock.calls.map(([, body]) => body.baseRevision)).toEqual([4, 5]);
    expect(result.current.receipt?.revision).toBe(6);
    expect(result.current.getRevision()).toBe(6);
  });
});
