import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { WorkTerminalDrawer } from "./WorkTerminalDrawer";
import { detectTerminalLinks, repositoryPath } from "./terminalLinks";
import { nextTerminal, normalizeTerminalLayout, readTerminalLayout, rememberTerminalLayout, removeTerminal } from "./terminalLayout";
import {
  formatTerminalReference,
  openTerminalReference,
  terminalReferenceIn,
  type TerminalReference,
} from "./terminalReference";

const reference: TerminalReference = {
  ref: "terminal:attempt-a:tests:range",
  ventureId: "venture-a",
  workspaceId: "attempt-a",
  threadRef: "thread:one",
  terminalId: "tests",
  terminalName: "Tests",
  text: "npm test\nFAIL src/client.test.ts:42",
  start: { x: 0, y: 10 },
  end: { x: 31, y: 11 },
};

describe("Thread terminal capability", () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });

  it("persists a bounded named split layout per exact venture/workspace", () => {
    let layout = normalizeTerminalLayout(null);
    layout = nextTerminal(layout, "tests");
    layout = { ...layout, activeId: "main", splitId: "tests" };
    rememberTerminalLayout("venture-a", "attempt-a", layout);
    expect(readTerminalLayout("venture-a", "attempt-a")).toEqual(layout);
    expect(readTerminalLayout("venture-a", "attempt-b").terminals).toEqual([{ id: "main", name: "Terminal" }]);
    expect(removeTerminal(layout, "tests")).toEqual({ terminals: [{ id: "main", name: "Terminal" }], activeId: "main", splitId: null });
  });

  it("detects file, line, URL, and localhost links without widening absolute paths", () => {
    const links = detectTerminalLinks("FAIL ui/src/client.test.ts:42:7 http://localhost:5173 https://example.com/docs");
    expect(links).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "file", path: "ui/src/client.test.ts", line: 42, column: 7 }),
      expect.objectContaining({ kind: "url", value: "http://localhost:5173", localhost: true }),
      expect.objectContaining({ kind: "url", value: "https://example.com/docs", localhost: false }),
    ]));
    expect(repositoryPath({ kind: "file", value: "/safe/a.ts:2", path: "/safe/a.ts", line: 2, column: null, start: 0, end: 12 }, "/safe")).toBe("a.ts");
    expect(repositoryPath({ kind: "file", value: "/other/a.ts:2", path: "/other/a.ts", line: 2, column: null, start: 0, end: 13 }, "/safe")).toBeNull();
  });

  it("round-trips a compact source-bearing selection and reopens its contextual drawer", () => {
    const formatted = formatTerminalReference(reference);
    expect(terminalReferenceIn(formatted)).toEqual({ reference, content: expect.stringContaining("Terminal Tests") });
    render(<WorkTerminalDrawer workspaceId="attempt-a"><div>Native PTY</div></WorkTerminalDrawer>);
    expect(screen.queryByText("Native PTY")).not.toBeInTheDocument();
    act(() => openTerminalReference(reference));
    expect(screen.getByText("Native PTY")).toBeInTheDocument();
  });

  it("does not open a foreign attempt's terminal drawer", () => {
    render(<WorkTerminalDrawer workspaceId="attempt-b"><div>Foreign PTY</div></WorkTerminalDrawer>);
    openTerminalReference(reference);
    expect(screen.queryByText("Foreign PTY")).not.toBeInTheDocument();
  });
});
