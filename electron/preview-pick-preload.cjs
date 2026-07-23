// Guest preload for the workspace preview: element pick. The founder starts a pick from the
// preview toolbar; hovering highlights the element under the pointer and a click captures its
// selector, source context, and rect, which return to the composer as exact context.
// Portions Copyright (c) 2026 T3 Tools Inc. Licensed under MIT (github.com/pingdotgg/t3code).

const { ipcRenderer } = require("electron");

const START_PICK = "drover-preview:start-pick";
const CANCEL_PICK = "drover-preview:cancel-pick";
const ELEMENT_PICKED = "drover-preview:element-picked";
const HTML_PREVIEW_LIMIT = 2_000;

let pickSession = null;

function selectorFor(element) {
  if (element.id) return `#${CSS.escape(element.id)}`;
  for (const attribute of ["data-testid", "name"]) {
    const value = element.getAttribute(attribute);
    if (value) return `${element.tagName.toLowerCase()}[${attribute}=${JSON.stringify(value)}]`;
  }
  const parts = [];
  let current = element;
  while (current && current.nodeType === Node.ELEMENT_NODE && parts.length < 8) {
    const parent = current.parentElement;
    const siblings = parent ? Array.from(parent.children).filter((child) => child.tagName === current.tagName) : [];
    const base = current.tagName.toLowerCase();
    parts.unshift(siblings.length > 1 ? `${base}:nth-of-type(${siblings.indexOf(current) + 1})` : base);
    current = parent;
  }
  return parts.join(" > ");
}

// Best-effort React fiber walk: nearest named component and its debug source (dev builds only).
function reactContext(element) {
  const fiberKey = Object.keys(element).find((key) => key.startsWith("__reactFiber$"));
  let fiber = fiberKey ? element[fiberKey] : null;
  let componentName = null;
  let source = null;
  for (let depth = 0; fiber && depth < 50; depth += 1) {
    const type = fiber.type;
    const name = typeof type === "function" ? type.displayName || type.name : typeof type === "string" ? null : type?.displayName;
    if (name && !componentName) componentName = name;
    const debugSource = fiber._debugSource;
    if (debugSource?.fileName && !source) {
      source = { fileName: debugSource.fileName, lineNumber: debugSource.lineNumber ?? null, columnNumber: debugSource.columnNumber ?? null };
    }
    if (componentName && source) break;
    fiber = fiber.return;
  }
  return { componentName, source };
}

function capturedElement(element) {
  const { componentName, source } = reactContext(element);
  return {
    pageUrl: location.href,
    pageTitle: document.title || null,
    tagName: element.tagName.toLowerCase(),
    selector: selectorFor(element),
    htmlPreview: element.outerHTML.slice(0, HTML_PREVIEW_LIMIT),
    componentName,
    source,
    stack: source ? [source] : [],
    styles: "",
    pickedAt: new Date().toISOString(),
  };
}

function stopPick() {
  if (!pickSession) return;
  const { highlight, label, onMove, onClick, onKeyDown } = pickSession;
  document.removeEventListener("mousemove", onMove, true);
  document.removeEventListener("click", onClick, true);
  document.removeEventListener("keydown", onKeyDown, true);
  highlight.remove();
  label.remove();
  document.documentElement.style.cursor = "";
  pickSession = null;
}

function startPick() {
  stopPick();
  const highlight = document.createElement("div");
  highlight.setAttribute("data-drover-pick", "highlight");
  highlight.style.cssText = "position:fixed;pointer-events:none;z-index:2147483646;border:1.5px solid #7c9cff;background:rgba(124,156,255,0.14);border-radius:3px;display:none;";
  const label = document.createElement("div");
  label.setAttribute("data-drover-pick", "label");
  label.style.cssText = "position:fixed;pointer-events:none;z-index:2147483646;background:#151622;color:#e8eaf6;font:11px/1.6 ui-monospace,monospace;padding:1px 7px;border-radius:3px;display:none;max-width:60vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
  document.documentElement.append(highlight, label);
  document.documentElement.style.cursor = "crosshair";
  let target = null;

  const onMove = (event) => {
    const element = document.elementFromPoint(event.clientX, event.clientY);
    if (!element || element === highlight || element === label || element === document.documentElement || element === document.body) return;
    target = element;
    const rect = element.getBoundingClientRect();
    highlight.style.display = "block";
    highlight.style.left = `${rect.left}px`;
    highlight.style.top = `${rect.top}px`;
    highlight.style.width = `${rect.width}px`;
    highlight.style.height = `${rect.height}px`;
    label.style.display = "block";
    label.style.left = `${Math.max(4, rect.left)}px`;
    label.style.top = `${rect.bottom + 4}px`;
    label.textContent = selectorFor(element);
  };
  const onClick = (event) => {
    if (!event.isTrusted) return;
    event.preventDefault();
    event.stopPropagation();
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const element = capturedElement(target);
    const annotation = {
      id: `pick-${Date.now().toString(36)}`,
      pageUrl: location.href,
      pageTitle: document.title || null,
      comment: "",
      elements: [{ id: "el-1", element, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } }],
      regions: [],
      strokes: [],
      styleChanges: [],
      screenshot: null,
      createdAt: new Date().toISOString(),
    };
    stopPick();
    // The screenshot rect is captured by the host after the overlay is gone.
    ipcRenderer.send(ELEMENT_PICKED, annotation, { x: rect.x, y: rect.y, width: rect.width, height: rect.height });
  };
  const onKeyDown = (event) => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); stopPick(); }
  };

  document.addEventListener("mousemove", onMove, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKeyDown, true);
  pickSession = { highlight, label, onMove, onClick, onKeyDown };
}

ipcRenderer.on(START_PICK, () => startPick());
ipcRenderer.on(CANCEL_PICK, () => stopPick());
