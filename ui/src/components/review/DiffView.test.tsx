import { render, screen } from "@testing-library/react";
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

describe("DiffView", () => {
  it("renders a known diff with path, hunk, and +/- counts", () => {
    render(<DiffView diff={DIFF} />);
    expect(screen.getByText("src/hello.ts")).toBeInTheDocument();
    // Two additions, one deletion shown in the file stat.
    expect(screen.getByText("+2")).toBeInTheDocument();
    expect(screen.getByText("−1")).toBeInTheDocument();
    expect(screen.getByText("new line")).toBeInTheDocument();
    expect(screen.getByText("old line")).toBeInTheDocument();
    expect(screen.getByText(/@@ -1,2 \+1,3 @@/)).toBeInTheDocument();
  });

  it("shows a quiet empty state for unparseable input", () => {
    render(<DiffView diff="not a diff at all" />);
    expect(screen.getByText("No reviewable difference is available.")).toBeInTheDocument();
  });
});
