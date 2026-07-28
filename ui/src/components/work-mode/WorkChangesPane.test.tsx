import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import type { CodingWorkspace } from "@/api";
import { WorkChangesPane } from "./WorkChangesPane";

const diff = `diff --git a/ui/a.ts b/ui/a.ts
--- a/ui/a.ts
+++ b/ui/a.ts
@@ -1 +1 @@
-old
+new
diff --git a/ui/b.ts b/ui/b.ts
--- a/ui/b.ts
+++ b/ui/b.ts
@@ -1 +1 @@
-old
+new`;

const workspace = {
  id: "attempt-one",
  kind: "native-code",
  ventureId: "venture-one",
  threadRef: "thread:one",
  betId: null,
  changedFiles: [{ status: "M", path: "ui/a.ts" }, { status: "A", path: "ui/b.ts" }],
  diff,
  patchHash: "patch-one",
} as CodingWorkspace;

describe("Work changes navigation", () => {
  beforeEach(() => localStorage.clear());

  it("moves through exact files from the keyboard and clears only that file's unread marker", () => {
    const { container } = render(<WorkChangesPane workspace={workspace} />);
    expect(screen.getByLabelText("M, unread")).toBeInTheDocument();
    expect(screen.getByLabelText("A, unread")).toBeInTheDocument();
    fireEvent.keyDown(container.querySelector(".work-changes")!, { key: "ArrowRight", altKey: true });
    expect(screen.getByText("2 of 2")).toBeInTheDocument();
    expect(screen.getByLabelText("A")).toBeInTheDocument();
    expect(screen.getByLabelText("M, unread")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous changed file" })).toHaveAttribute("aria-keyshortcuts", "Alt+ArrowLeft");
  });
});
