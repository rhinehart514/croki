// Preview tools for a coding run: the agent drives its OWN worktree's dev server in the desktop
// preview pane — open, look, click, type, and wait — through the preview broker. The tools are
// bound to the run's exact workspace at construction, so no run can name another Thread's preview.

import { invokePreview } from "./preview-broker.mjs";

const selectorProperties = {
  selector: { type: "string", description: "CSS selector for the target element." },
  locator: { type: "string", description: "Playwright locator (for example text=Save, role=button[name=\"Save\"]). Takes precedence over selector." },
};

export function buildPreviewWorkLoopTools({ workspace, runId, trackCall }) {
  if (!workspace?.id || !workspace?.worktree || !runId) return [];
  const call = (operation, input = {}) => invokePreview({
    runId,
    workspaceId: workspace.id,
    worktree: workspace.worktree,
    operation,
    input,
  });
  const tool = (name, description, properties, required, operation) => ({
    name,
    description,
    input_schema: { type: "object", properties, ...(required.length ? { required } : {}) },
    async run(input = {}) {
      trackCall(name);
      return call(operation, input);
    },
  });

  return [
    tool(
      "preview_open",
      "Open this run's own dev server in the desktop preview pane. Start the server in the worktree first (for example via the terminal), then pass its port. Waits until the server answers HTTP.",
      { port: { type: "integer", minimum: 1, maximum: 65535 }, path: { type: "string", description: "Optional path starting with /." }, timeoutMs: { type: "integer", minimum: 1000, maximum: 120000 } },
      ["port"],
      "open",
    ),
    tool(
      "preview_navigate",
      "Navigate the open preview to another path or loopback URL of the same dev server.",
      { path: { type: "string" }, url: { type: "string" } },
      [],
      "navigate",
    ),
    tool(
      "preview_click",
      "Click an element in the open preview by selector/locator, or exact viewport coordinates.",
      { ...selectorProperties, x: { type: "number" }, y: { type: "number" } },
      [],
      "click",
    ),
    tool(
      "preview_type",
      "Type text into an editable element in the open preview (the focused element when no selector is given). Set clear to replace existing content.",
      { text: { type: "string" }, ...selectorProperties, clear: { type: "boolean" } },
      ["text"],
      "type",
    ),
    tool(
      "preview_press",
      "Press one key (with optional modifiers) in the open preview, for example Enter, Escape, Tab, or a single character.",
      { key: { type: "string" }, modifiers: { type: "array", items: { type: "string", enum: ["Alt", "Control", "Meta", "Shift"] } } },
      ["key"],
      "press",
    ),
    tool(
      "preview_scroll",
      "Scroll the open preview window, or a specific element, by a pixel delta.",
      { deltaX: { type: "number" }, deltaY: { type: "number" }, ...selectorProperties },
      [],
      "scroll",
    ),
    tool(
      "preview_snapshot",
      "Capture the open preview's current state: URL, title, visible text, interactive elements with selectors, and a screenshot saved under .drover-preview/ in the worktree (read it as an image file).",
      {},
      [],
      "snapshot",
    ),
    tool(
      "preview_evaluate",
      "Evaluate a JavaScript expression in the open preview page and return its JSON-serializable result (kept under 64KB).",
      { expression: { type: "string" }, awaitPromise: { type: "boolean" }, returnByValue: { type: "boolean" } },
      ["expression"],
      "evaluate",
    ),
    tool(
      "preview_wait_for",
      "Wait until a selector exists, text appears, and/or the URL contains a substring in the open preview (default timeout 15s).",
      { ...selectorProperties, text: { type: "string" }, urlIncludes: { type: "string" }, timeoutMs: { type: "integer", minimum: 100, maximum: 60000 } },
      [],
      "wait_for",
    ),
  ];
}
