import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RepositoryFile } from "@/api";
import { COMPOSER_SOURCE_REFERENCE_EVENT } from "@/components/now/composerSourceReference";
import { RepositoryBrowser } from "./RepositoryBrowser";

const mocks = vi.hoisted(() => ({
  tree: vi.fn(),
  search: vi.fn(),
  file: vi.fn(),
  ventureFile: vi.fn(),
}));

vi.mock("@/api", async (original) => ({
  ...await original<typeof import("@/api")>(),
  getWorkspaceRepositoryTree: mocks.tree,
  searchWorkspaceRepository: mocks.search,
  getWorkspaceRepositoryFile: mocks.file,
  getVentureRepositoryFile: mocks.ventureFile,
}));

const ready = (startLine = 1, endLine = startLine + 2): RepositoryFile => ({
  state: "ready",
  path: "ui/src/components/thread/ThreadConversation.tsx",
  presentation: "text",
  size: 24_000,
  lineCount: 500,
  content: Array.from({ length: endLine - startLine + 1 }, (_, index) => `content ${startLine + index}`).join("\n"),
  digest: "0123456789abcdef",
  startLine,
  endLine,
  hasMoreBefore: startLine > 1,
  hasMoreAfter: endLine < 500,
  ref: `repository:ui/src/components/thread/ThreadConversation.tsx#L${startLine}-L${endLine}:0123456789ab`,
});

function browser() {
  return <RepositoryBrowser ventureId="venture-one" workspaceId="workspace-one" threadRef="thread:one" composerScopeKey="scope:one" onClose={vi.fn()} />;
}

describe("RepositoryBrowser", () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.tree.mockReset().mockResolvedValue({
      tree: {
        workspacePath: "",
        entries: Array.from({ length: 100 }, (_, index) => ({
          path: `src/file-${String(index).padStart(4, "0")}.ts`,
          name: `file-${String(index).padStart(4, "0")}.ts`,
          kind: "file",
          presentation: "text",
        })),
        cursor: 0,
        nextCursor: 100,
        limit: 100,
        total: 5_000,
        truncated: false,
      },
    });
    mocks.search.mockResolvedValue({
      search: {
        workspacePath: "",
        entries: [{ path: "ui/src/components/thread/ThreadConversation.tsx", name: "ThreadConversation.tsx", presentation: "text" }],
        cursor: 0, nextCursor: null, limit: 100, total: 1, truncated: false,
      },
    });
    mocks.file.mockImplementation(async (_venture, _workspace, input) => ({
      file: ready(input.startLine ?? 1, input.endLine ?? (input.startLine ?? 1) + 2),
    }));
    mocks.ventureFile.mockReset().mockImplementation(async (_venture, input) => ({
      file: ready(input.startLine ?? 1, input.endLine ?? (input.startLine ?? 1) + 2),
    }));
  });

  it("opens only the exact cited venture range without requesting workspace tree or search", async () => {
    render(<RepositoryBrowser
      ventureId="venture-one"
      threadRef="thread:historic"
      initialReference={{
        path: "ui/src/components/thread/ThreadConversation.tsx",
        startLine: 37,
        endLine: 39,
        digest: "0123456789ab",
      }}
    />);

    await waitFor(() => expect(mocks.ventureFile).toHaveBeenCalledWith("venture-one", {
      path: "ui/src/components/thread/ThreadConversation.tsx",
      startLine: 37,
      endLine: 39,
    }));
    expect(mocks.tree).not.toHaveBeenCalled();
    expect(mocks.search).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Search repository paths")).not.toBeInTheDocument();
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    expect(await screen.findByRole("listitem", { name: "Line 37" })).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("marks a durable citation stale only when its exact returned range digest changed", async () => {
    render(<RepositoryBrowser
      ventureId="venture-one"
      threadRef="thread:stale"
      initialReference={{
        path: "ui/src/components/thread/ThreadConversation.tsx",
        startLine: 37,
        endLine: 39,
        digest: "deadbeef1234",
      }}
    />);

    expect(await screen.findByRole("alert")).toHaveTextContent("earlier version of the selected lines");
    expect(mocks.ventureFile).toHaveBeenCalledWith("venture-one", expect.objectContaining({
      startLine: 37,
      endLine: 39,
    }));
  });

  it("keeps a 5,000-path repository page-sized, searches ranked paths, and opens unchanged line 200", async () => {
    render(browser());
    await waitFor(() => expect(mocks.tree).toHaveBeenCalled());
    expect(screen.getByText("Load more · 100 of 5000")).toBeVisible();
    expect(document.querySelectorAll(".repository-browser-layout aside li")).toHaveLength(100);

    fireEvent.change(screen.getByLabelText("Search repository paths"), { target: { value: "ThreadConversation" } });
    await waitFor(() => expect(mocks.search).toHaveBeenCalledWith("venture-one", "workspace-one", {
      query: "ThreadConversation", cursor: 0, limit: 100,
    }));
    fireEvent.click(await screen.findByText("ThreadConversation.tsx"));
    await screen.findByText("content 1");

    fireEvent.change(screen.getByLabelText("Go to line"), { target: { value: "200" } });
    fireEvent.click(screen.getByRole("button", { name: "Go" }));
    expect(await screen.findByRole("listitem", { name: "Line 200" })).toHaveTextContent("content 200");
    expect(mocks.file).toHaveBeenCalledWith("venture-one", "workspace-one", expect.objectContaining({
      path: "ui/src/components/thread/ThreadConversation.tsx",
      startLine: 200,
    }));
  });

  it("stages an exact source-bearing range and preserves the last coherent file after rejection", async () => {
    render(browser());
    fireEvent.change(screen.getByLabelText("Search repository paths"), { target: { value: "ThreadConversation" } });
    fireEvent.click(await screen.findByText("ThreadConversation.tsx"));
    await screen.findByText("content 1");
    fireEvent.click(screen.getByRole("listitem", { name: "Line 2" }));
    fireEvent.click(screen.getByRole("listitem", { name: "Line 3" }), { shiftKey: true });

    const reference = vi.fn();
    window.addEventListener(COMPOSER_SOURCE_REFERENCE_EVENT, reference);
    fireEvent.click(screen.getByRole("button", { name: "Add L2–L3 to direction" }));
    await waitFor(() => expect(reference).toHaveBeenCalled());
    expect((reference.mock.calls[0][0] as CustomEvent).detail).toEqual({
      scopeKey: "scope:one",
      path: "ui/src/components/thread/ThreadConversation.tsx",
      startLine: 2,
      endLine: 3,
      ref: "repository:ui/src/components/thread/ThreadConversation.tsx#L2-L3:0123456789ab",
    });
    window.removeEventListener(COMPOSER_SOURCE_REFERENCE_EVENT, reference);

    mocks.file.mockRejectedValueOnce(new Error("Repository browsing needs a safe worktree-relative path."));
    fireEvent.change(screen.getByLabelText("Go to line"), { target: { value: "999" } });
    fireEvent.click(screen.getByRole("button", { name: "Go" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("last coherent source remains visible");
    expect(screen.getByText("content 1")).toBeVisible();
  });

  it("restores the selected file and exact line after a full remount", async () => {
    const first = render(browser());
    fireEvent.change(screen.getByLabelText("Search repository paths"), { target: { value: "ThreadConversation" } });
    fireEvent.click(await screen.findByText("ThreadConversation.tsx"));
    await screen.findByText("content 1");
    fireEvent.change(screen.getByLabelText("Go to line"), { target: { value: "200" } });
    fireEvent.click(screen.getByRole("button", { name: "Go" }));
    await screen.findByRole("listitem", { name: "Line 200" });
    first.unmount();
    mocks.file.mockClear();

    render(browser());
    await waitFor(() => expect(mocks.file).toHaveBeenCalledWith("venture-one", "workspace-one", expect.objectContaining({
      startLine: 200,
    })));
    expect(await screen.findByRole("listitem", { name: "Line 200" })).toBeVisible();
  });
});
