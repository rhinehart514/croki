import { render, screen, waitFor } from "@testing-library/react";
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
});
