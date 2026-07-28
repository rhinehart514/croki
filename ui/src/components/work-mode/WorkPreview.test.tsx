import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildPreviewAnnotationPrompt } from "@/lib/previewAnnotation";
import { WorkPreview } from "./WorkPreview";
import { workPresentationScope } from "./previewPresentation";

const threadRef = "thread:preview-return";
const workspaceId = "workspace-1";
const rememberedUrl = "http://127.0.0.1:4310/exact-return";
const presentationScope = workPresentationScope("venture-1", threadRef);

function inspection(overrides: Partial<DroverPreviewInspection> = {}): DroverPreviewInspection {
  return {
    workspaceId,
    url: rememberedUrl,
    title: "Founder app",
    loading: false,
    reachable: true,
    canGoBack: true,
    canGoForward: false,
    control: { kind: "run", runId: "run-9", at: "2026-07-25T12:00:00.000Z" },
    suggestions: [{ port: 4311, url: "http://127.0.0.1:4311/", label: "Local server · 4311" }],
    ...overrides,
  };
}

function installBridge() {
  const preview = {
    attach: vi.fn(async () => ({ attached: true })),
    detach: vi.fn(async () => ({ detached: true })),
    inspect: vi.fn(async () => inspection()),
    control: vi.fn(async (
      _ventureId: string,
      _workspaceId: string,
      operation: string,
      input?: { url?: string; zoom?: number },
    ) => inspection({
      url: input?.url ?? rememberedUrl,
      control: { kind: "founder", runId: null, at: `founder:${operation}` },
    })),
    startPick: vi.fn(async () => ({ picking: true })),
    cancelPick: vi.fn(async () => ({ picking: false })),
    onOpenRequest: vi.fn(() => () => undefined),
    onState: vi.fn(() => () => undefined),
    onAnnotation: vi.fn(() => () => undefined),
  };
  window.droverDesktop = { preview } as unknown as DroverDesktopBridge;
  return preview;
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(`drover:work-preview:v1:${presentationScope}`, JSON.stringify({
    url: rememberedUrl,
    viewport: "mobile",
    zoom: 1.25,
  }));
});

afterEach(() => {
  delete window.droverDesktop;
  vi.restoreAllMocks();
});

describe("Work Preview continuity", () => {
  it("returns to the Thread's URL, viewport, zoom, selected Run control, and exact guest", async () => {
    const preview = installBridge();
    const result = render(<WorkPreview ventureId="venture-1" workspaceId={workspaceId} threadRef={threadRef} />);
    const webview = result.container.querySelector("webview") as DroverWebviewElement;
    const setZoomFactor = vi.fn();
    Object.assign(webview, {
      getWebContentsId: () => 77,
      setZoomFactor,
    });

    expect(webview).toHaveAttribute("src", rememberedUrl);
    expect(screen.getByRole("button", { name: "mobile" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("combobox", { name: /Zoom/ })).toHaveValue("1.25");

    act(() => webview.dispatchEvent(new Event("dom-ready")));
    await waitFor(() => expect(preview.attach).toHaveBeenCalledWith("venture-1", workspaceId, 77));
    expect(setZoomFactor).toHaveBeenCalledWith(1.25);
    expect(await screen.findByText("run-9 control")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Forward" })).toBeDisabled();
  });

  it("hands navigation back to the founder and persists responsive state for return", async () => {
    const preview = installBridge();
    render(<WorkPreview ventureId="venture-1" workspaceId={workspaceId} threadRef={threadRef} />);
    await screen.findByText("Local server · 4311");

    fireEvent.click(screen.getByRole("button", { name: /Local server · 4311/ }));
    await waitFor(() => expect(preview.control).toHaveBeenCalledWith(
      "venture-1",
      workspaceId,
      "navigate",
      { url: "http://127.0.0.1:4311/" },
    ));
    fireEvent.click(screen.getByRole("button", { name: "tablet" }));
    fireEvent.change(screen.getByRole("combobox", { name: /Zoom/ }), { target: { value: "1.5" } });

    expect(JSON.parse(localStorage.getItem(`drover:work-preview:v1:${presentationScope}`) ?? "{}")).toEqual({
      url: "http://127.0.0.1:4311/",
      viewport: "tablet",
      zoom: 1.5,
    });
  });

  it("keeps exact preview source identity in picked and captured composer context", () => {
    const prompt = buildPreviewAnnotationPrompt({
      id: "capture-1",
      pageUrl: rememberedUrl,
      pageTitle: "Founder app",
      comment: "Founder captured this exact preview state.",
      elements: [],
      regions: [],
      strokes: [],
      styleChanges: [],
      createdAt: "2026-07-25T12:00:00.000Z",
      sourceRef: `preview:${workspaceId}:${rememberedUrl}#capture-1`,
    });
    expect(prompt).toContain(`Source: preview:${workspaceId}:${rememberedUrl}#capture-1`);
    expect(prompt).toContain(`URL: ${rememberedUrl}`);
  });
});
