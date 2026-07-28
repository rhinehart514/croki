import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DiffView } from "./DiffView";

const DIFF = `diff --git a/src/hello.ts b/src/hello.ts
--- a/src/hello.ts
+++ b/src/hello.ts
@@ -1,2 +1,3 @@
 keep
-old line
+new line
+another new
`;

/** @pierre/diffs renders each file body into a <diffs-container> shadow root. */
function diffBodyText(): string {
  return [...document.querySelectorAll("diffs-container")]
    .map((node) => node.shadowRoot?.textContent ?? "")
    .join("\n");
}

describe("DiffView", () => {
  it("renders a known diff with path, +/- counts, and highlighted body", async () => {
    render(<DiffView diff={DIFF} />);
    expect(screen.getByText("src/hello.ts")).toBeInTheDocument();
    // Two additions, one deletion shown in the file stat.
    expect(screen.getByText("+2")).toBeInTheDocument();
    expect(screen.getByText("−1")).toBeInTheDocument();
    await waitFor(() => {
      const body = diffBodyText();
      expect(body).toContain("new line");
      expect(body).toContain("old line");
      expect(body).toContain("keep");
    });
  });

  it("shows the exact raw text with an honest reason for unparseable input", () => {
    render(<DiffView diff="not a diff at all" />);
    expect(screen.getByText("This isn’t a readable diff, so the exact text is shown.")).toBeInTheDocument();
    expect(screen.getByText("not a diff at all")).toBeInTheDocument();
  });

  it("shows a quiet empty state when there is nothing to review", () => {
    render(<DiffView diff="   " />);
    expect(screen.getByText("No reviewable difference is available.")).toBeInTheDocument();
  });

  it("can focus one selected file without duplicating the rest of the diff", () => {
    const twoFiles = `${DIFF}\ndiff --git a/src/other.ts b/src/other.ts\n--- a/src/other.ts\n+++ b/src/other.ts\n@@ -1 +1 @@\n-old\n+new`;
    render(<DiffView diff={twoFiles} path="src/other.ts" />);
    expect(screen.getByText("src/other.ts")).toBeInTheDocument();
    expect(screen.queryByText("src/hello.ts")).not.toBeInTheDocument();
  });

  it("collapses a large diff until the founder opens its exact file", async () => {
    const additions = Array.from({ length: 201 }, (_, index) => `+line ${index}`).join("\n");
    const large = `diff --git a/src/large.ts b/src/large.ts
--- a/src/large.ts
+++ b/src/large.ts
@@ -0,0 +1,201 @@
${additions}
`;
    render(<DiffView diff={large} />);

    const toggle = screen.getByRole("button", { name: "Show diff for src/large.ts" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(document.querySelector("diffs-container")).toBeNull();

    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Hide diff for src/large.ts" })).toHaveAttribute("aria-expanded", "true");
    await waitFor(() => expect(document.querySelector("diffs-container")).not.toBeNull());
  });

  it("can expand and collapse every changed file together", async () => {
    const files = Array.from({ length: 6 }, (_, index) => `diff --git a/src/${index}.ts b/src/${index}.ts
--- a/src/${index}.ts
+++ b/src/${index}.ts
@@ -0,0 +1 @@
+line ${index}
`).join("\n");
    render(<DiffView diff={files} />);

    expect(screen.getByRole("button", { name: "Expand all files" })).toBeInTheDocument();
    expect(document.querySelectorAll("diffs-container")).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Expand all files" }));
    await waitFor(() => expect(document.querySelectorAll("diffs-container")).toHaveLength(6));
    fireEvent.click(screen.getByRole("button", { name: "Collapse all files" }));
    expect(document.querySelectorAll("diffs-container")).toHaveLength(0);
  });
});
