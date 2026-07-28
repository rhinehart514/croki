import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { RepositoryFile } from "@/api";
import { RepositoryFileView } from "./RepositoryFileView";

const textFile = (presentation: "text" | "markdown" | "web", content: string): RepositoryFile => ({
  state: "ready",
  path: presentation === "markdown" ? "README.md" : presentation === "web" ? "index.html" : "source.ts",
  presentation,
  size: content.length,
  lineCount: content.split("\n").length,
  content,
  digest: "digest",
  startLine: 200,
  endLine: 201,
  hasMoreBefore: true,
  hasMoreAfter: true,
  ref: "repository:source.ts#L200-L201:digest",
});

describe("RepositoryFileView", () => {
  it("renders exact selectable text lines, Markdown, and sandboxed web material", () => {
    const select = vi.fn();
    const { rerender } = render(<RepositoryFileView file={textFile("text", "line two hundred\nline two oh one")} selection={{ startLine: 200, endLine: 200 }} onSelect={select} />);
    fireEvent.click(screen.getByRole("listitem", { name: "Line 201" }), { shiftKey: true });
    expect(select).toHaveBeenCalledWith(201, true);

    rerender(<RepositoryFileView file={textFile("markdown", "# Exact heading\nBody")} selection={{ startLine: 200, endLine: 200 }} onSelect={select} />);
    fireEvent.click(screen.getByText("Rendered Markdown"));
    expect(screen.getByRole("heading", { name: "Exact heading" })).toBeVisible();

    rerender(<RepositoryFileView file={textFile("web", "<html><h1>Exact web</h1></html>")} selection={{ startLine: 200, endLine: 200 }} onSelect={select} />);
    fireEvent.click(screen.getByText("Sandboxed preview"));
    expect(screen.getByTitle("index.html")).toHaveAttribute("sandbox", "");
  });

  it("renders images and names binary, oversized, and removed states exactly", () => {
    const { rerender } = render(<RepositoryFileView file={{
      state: "ready", path: "proof.png", presentation: "image", size: 4, lineCount: null,
      content: "AAAA", encoding: "base64", digest: "digest",
    }} selection={{ startLine: 1, endLine: 1 }} onSelect={vi.fn()} />);
    expect(screen.getByRole("img", { name: "proof.png" })).toHaveAttribute("src", "data:image/png;base64,AAAA");

    for (const [state, label] of [
      ["binary", "Binary file"],
      ["oversized", "File exceeds the review limit"],
      ["removed", "File was removed"],
    ] as const) {
      rerender(<RepositoryFileView file={{
        state, path: `proof.${state}`, presentation: "binary", size: state === "removed" ? null : 20,
        lineCount: null, message: `${state} exact state`,
      }} selection={{ startLine: 1, endLine: 1 }} onSelect={vi.fn()} />);
      expect(screen.getByText(label)).toBeVisible();
      expect(screen.getByText(`${state} exact state`)).toBeVisible();
    }
  });
});
