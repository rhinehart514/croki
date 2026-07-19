import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Direction } from "@/components/now/directionModel";
import type { VentureOutline } from "./ventureOutlineModel";
import { WorkspaceIndex } from "./WorkspaceIndex";

vi.mock("@/components/firm/FirmSettings", () => ({
  FirmSettings: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog" aria-label="Venture settings"><button type="button" onClick={onClose}>Close</button></div>
  ),
}));

vi.mock("@/components/firm/VentureCreateDialog", () => ({
  VentureCreateDialog: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog" aria-label="Connect a product"><button type="button" onClick={onClose}>Close</button></div>
  ),
}));

const venture = { id: "v1", name: "Drover", repository: "/products/drover", createdAt: "now", updatedAt: "now" };
const otherVenture = { id: "v2", name: "Signal", repository: "/products/signal", createdAt: "now", updatedAt: "now" };
const direction: Direction = {
  id: "direction-1",
  sentence: "Make the workbench the venture home",
  createdAt: "2026-07-18T10:00:00.000Z",
  updatedAt: "2026-07-18T10:00:00.000Z",
  betIds: ["bet-1"],
  primaryBetId: "bet-1",
  waitingWallItemIds: [],
  activeDriveIds: ["work-1"],
  outcomeIds: [],
  proofCount: 1,
  approaches: 1,
  state: "working",
  needsYou: false,
  understanding: "A product change is ready to review.",
  attribution: null,
};
const object = {
  id: "onboarding", objectRef: "object:onboarding", name: "Onboarding", statement: "Reach useful work immediately.",
  type: "experience", territory: "product" as const, sectionId: "experiences", parentRef: null,
  assertion: "founder-asserted" as const, provenance: null, threadRefs: [direction.id], targetable: true,
  architectureRole: "product-loop", updatedAt: direction.updatedAt, thoughts: [direction], children: [],
};
const outline: VentureOutline = {
  territories: [
    { id: "product", label: "Product", thoughtCount: 1, sections: [{ id: "experiences", label: "Experiences", thoughtCount: 1, objects: [object] }] },
    { id: "gtm", label: "Go-to-market", thoughtCount: 0, sections: [] },
  ],
};

function renderIndex(overrides: Partial<React.ComponentProps<typeof WorkspaceIndex>> = {}) {
  const props: React.ComponentProps<typeof WorkspaceIndex> = {
    venture,
    ventures: [venture, otherVenture],
    lens: null,
    messages: [
      { id: "m1", ventureId: "v1", role: "founder", content: "Make the workbench the venture home", teammateRef: null, betId: "bet-1", createdAt: "2026-07-18T10:00:00.000Z" },
    ],
    outline,
    workState: "ready",
    workError: null,
    selection: null,
    selectedDirectionId: null,
    selectedObjectId: null,
    needsYou: 2,
    search: "",
    needsOnly: false,
    now: Date.parse("2026-07-18T10:05:00.000Z"),
    activeWork: [],
    readOnly: false,
    readOnlyReason: "",
    onSearch: vi.fn(),
    onToggleNeeds: vi.fn(),
    onNewDirection: vi.fn(),
    onSelectDirection: vi.fn(),
    onSelectObject: vi.fn(),
    onSwitchVenture: vi.fn(),
    onClearScope: vi.fn(),
    onStopActiveWork: vi.fn(),
    onConfigurationChanged: vi.fn(),
    onRetry: vi.fn(),
    ...overrides,
  };
  return { ...render(<WorkspaceIndex {...props} />), props };
}

describe("WorkspaceIndex", () => {
  beforeEach(() => window.localStorage.clear());

  it("makes Product and GTM calm workspaces with thought threads as the primary rows", () => {
    const { props } = renderIndex();
    const nav = screen.getByRole("navigation", { name: "Venture outline" });

    expect(within(nav).getByText("Workspaces")).toBeTruthy();
    expect(within(nav).getByRole("button", { name: "Product" }).getAttribute("aria-expanded")).toBe("true");
    expect(within(nav).queryByText("Experiences")).toBeNull();
    const work = within(nav).getByRole("button", { name: /Make the workbench the venture home/ });
    fireEvent.click(work);
    expect(props.onSelectDirection).toHaveBeenCalledWith(direction);
    expect(screen.queryByRole("list", { name: "Conversation messages" })).toBeNull();
    expect(screen.getByText("Venture conversation")).toBeTruthy();
  });

  it("switches ventures and preserves direct access to venture creation, new work, attention, and settings", () => {
    const { props } = renderIndex();

    fireEvent.click(screen.getByRole("button", { name: /Drover/ }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: /Signal/ }));
    expect(props.onSwitchVenture).toHaveBeenCalledWith(otherVenture);

    fireEvent.click(screen.getByRole("button", { name: /Drover/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Start another venture/ }));
    expect(screen.getByRole("dialog", { name: "Connect a product" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "New direction" }));
    expect(props.onNewDirection).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: /Needs you/ }));
    expect(props.onToggleNeeds).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByRole("dialog", { name: "Venture settings" })).toBeTruthy();
  });

  it("folds direction groups and resizes from the keyboard with persisted bounds", () => {
    renderIndex();

    fireEvent.click(screen.getByRole("button", { name: "Product" }));
    expect(screen.queryByRole("button", { name: /Make the workbench the venture home/ })).toBeNull();

    const separator = screen.getByRole("separator", { name: "Resize work index" });
    expect(separator.getAttribute("aria-valuenow")).toBe("256");
    fireEvent.keyDown(separator, { key: "ArrowRight" });
    expect(separator.getAttribute("aria-valuenow")).toBe("272");
    expect(window.localStorage.getItem("drover.workspace-index.width")).toBe("272");
    fireEvent.keyDown(separator, { key: "Home" });
    expect(separator.getAttribute("aria-valuenow")).toBe("208");
  });

  it("shows active work as a quiet stoppable row", () => {
    const stop = vi.fn();
    renderIndex({
      activeWork: [{ id: "work-1", teammateRef: "sable", betId: "bet-1", runtime: "codex", startedAt: "2026-07-18T10:00:00.000Z", abortSupported: true, abortRequestedAt: null }],
      onStopActiveWork: stop,
    });

    fireEvent.click(screen.getByRole("button", { name: "Stop current work" }));
    expect(stop).toHaveBeenCalledWith("work-1");
  });

  it("does not confuse loading or failure with an empty venture", () => {
    const loading = renderIndex({ workState: "loading", outline: { territories: [] } });
    expect(screen.getByRole("status").textContent).toContain("Loading venture");
    loading.unmount();

    const retry = vi.fn();
    renderIndex({ workState: "failed", workError: "Atlas is unavailable", outline: { territories: [] }, onRetry: retry });
    expect(screen.getByRole("alert").textContent).toContain("Atlas is unavailable");
    fireEvent.click(screen.getByRole("button", { name: /Retry/ }));
    expect(retry).toHaveBeenCalledOnce();
  });
});
