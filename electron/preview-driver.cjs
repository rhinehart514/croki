// CDP driver for one preview guest: click, type, press, scroll, evaluate, waitFor, and snapshot
// over `webContents.debugger`, with Playwright's InjectedScript used purely as a selector engine.
// Operations serialize on one queue so a multi-step interaction never interleaves with itself.
// Portions Copyright (c) 2026 T3 Tools Inc. Licensed under MIT (github.com/pingdotgg/t3code).

const MAX_EVALUATION_BYTES = 64_000;
const MAX_VISIBLE_TEXT_LENGTH = 20_000;
const MAX_INTERACTIVE_ELEMENTS = 200;
const WAIT_FOR_POLL_MS = 100;
const DEFAULT_WAIT_TIMEOUT_MS = 15_000;
const MAX_WAIT_TIMEOUT_MS = 60_000;

const locatorOf = (input) => input.locator ?? (input.selector ? `css=${input.selector}` : null);

const SNAPSHOT_PAGE_EXPRESSION = `(() => {
  const selectorFor = (element) => {
    if (element.id) return "#" + CSS.escape(element.id);
    for (const attribute of ["data-testid", "name"]) {
      const value = element.getAttribute(attribute);
      if (value) return element.tagName.toLowerCase() + "[" + attribute + "=" + JSON.stringify(value) + "]";
    }
    const buildParts = (current, parts = []) => {
      if (!current || current.nodeType !== Node.ELEMENT_NODE || parts.length >= 8) return parts;
      const parent = current.parentElement;
      const siblings = parent ? Array.from(parent.children).filter((child) => child.tagName === current.tagName) : [];
      const base = current.tagName.toLowerCase();
      const part = siblings.length > 1 ? base + ":nth-of-type(" + (siblings.indexOf(current) + 1) + ")" : base;
      return buildParts(parent, [part, ...parts]);
    };
    return buildParts(element).join(" > ");
  };
  const visible = (element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
  };
  const elements = Array.from(document.querySelectorAll(
    "a[href],button,input,textarea,select,[role],[tabindex]"
  )).filter(visible).slice(0, ${MAX_INTERACTIVE_ELEMENTS}).map((element) => {
    const rect = element.getBoundingClientRect();
    return {
      tag: element.tagName.toLowerCase(),
      role: element.getAttribute("role"),
      name: element.getAttribute("aria-label") || element.innerText || element.getAttribute("name") || "",
      selector: selectorFor(element),
      x: rect.x, y: rect.y, width: rect.width, height: rect.height,
    };
  });
  return {
    url: location.href,
    title: document.title,
    loading: document.readyState !== "complete",
    visibleText: (document.body?.innerText || "").slice(0, ${MAX_VISIBLE_TEXT_LENGTH}),
    interactiveElements: elements,
  };
})()`;

function resolveTargetExpression(locatorJson, injectedGlobal) {
  return locatorJson
    ? `(() => { const injected = globalThis.${injectedGlobal}; return injected.querySelector(injected.parseSelector(${locatorJson}), document, true); })()`
    : "document.activeElement";
}

function createPreviewDriver({ webContents: wc, installExpression, injectedGlobal, platform = process.platform, getFocusedWebContents = () => null, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) }) {
  const { makePreviewKeySequence } = require("./preview-keyboard.cjs");
  let queue = Promise.resolve();

  const send = (method, params) => wc.debugger.sendCommand(method, params);

  function run(work) {
    const next = queue.then(async () => {
      if (wc.isDestroyed()) throw new Error("The preview page is closed.");
      if (!wc.debugger.isAttached()) wc.debugger.attach("1.3");
      return work();
    });
    queue = next.catch(() => undefined);
    return next;
  }

  async function evaluate(expression, { returnByValue = true, awaitPromise = true } = {}) {
    const response = await send("Runtime.evaluate", { expression, awaitPromise, returnByValue, userGesture: true });
    if (response?.exceptionDetails) {
      const detail = response.exceptionDetails.exception?.description || response.exceptionDetails.text || "evaluation failed";
      throw new Error(`Preview evaluation failed: ${String(detail).slice(0, 500)}`);
    }
    return response?.result?.value;
  }

  async function ensureInjected() {
    if (await evaluate(`Boolean(globalThis.${injectedGlobal})`)) return;
    await evaluate(installExpression());
  }

  async function resolveClickPoint(input) {
    if (!("selector" in input) && !("locator" in input)) return { x: input.x, y: input.y };
    await ensureInjected();
    const point = await evaluate(`(() => {
      try {
        const injected = globalThis.${injectedGlobal};
        const parsed = injected.parseSelector(${JSON.stringify(locatorOf(input))});
        const element = injected.querySelector(parsed, document, true);
        if (!element) return { notFound: true };
        const visible = injected.elementState(element, "visible");
        const enabled = injected.elementState(element, "enabled");
        if (!visible.matches || !enabled.matches) return { notFound: true };
        element.scrollIntoView({ block: "center", inline: "center" });
        const rect = element.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      } catch (error) {
        return { invalidSelector: true, message: String(error) };
      }
    })()`);
    if (point.invalidSelector) throw new Error(`Invalid selector for click: ${point.message.slice(0, 300)}`);
    if (point.notFound) throw new Error("No visible, enabled element matched that selector.");
    return point;
  }

  const click = (input) => run(async () => {
    await send("Runtime.enable");
    await send("Input.setIgnoreInputEvents", { ignore: false });
    const point = await resolveClickPoint(input);
    const viewport = await evaluate("({ width: window.innerWidth, height: window.innerHeight })");
    if (point.x < 0 || point.y < 0 || point.x > viewport.width || point.y > viewport.height) {
      throw new Error(`Click point (${Math.round(point.x)}, ${Math.round(point.y)}) is outside the ${viewport.width}x${viewport.height} viewport.`);
    }
    await send("Input.dispatchMouseEvent", { type: "mousePressed", ...point, button: "left", clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", ...point, button: "left", clickCount: 1 });
    return { clicked: true, x: point.x, y: point.y };
  });

  // CDP Input.insertText silently drops text until Electron has activated a hidden guest
  // WebContents with a pointer event. Editing in the page runtime keeps background automation
  // deterministic without stealing foreground app focus.
  const type = (input) => run(async () => {
    await send("Runtime.enable");
    const locator = locatorOf(input);
    if (locator) await ensureInjected();
    const result = await evaluate(`(() => {
      try {
        const element = ${resolveTargetExpression(locator ? JSON.stringify(locator) : null, injectedGlobal)};
        if (!element) return { notFound: true };
        const textControl =
          element instanceof HTMLTextAreaElement ||
          (element instanceof HTMLInputElement &&
            !new Set(["button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit"]).has(element.type));
        const editable = textControl || element.isContentEditable;
        if (!editable || element.disabled || element.readOnly) return { notEditable: true };
        element.focus();
        if (document.activeElement !== element) return { notEditable: true };
        const clear = ${input.clear === true};
        if (clear) {
          if (textControl) element.select();
          else {
            const range = document.createRange();
            range.selectNodeContents(element);
            const selection = document.getSelection();
            selection?.removeAllRanges();
            selection?.addRange(range);
          }
        }
        const text = ${JSON.stringify(String(input.text ?? ""))};
        let inserted = true;
        if (text.length > 0) {
          inserted = document.execCommand("insertText", false, text);
        } else if (clear) {
          document.execCommand("delete", false);
          const cleared = textControl ? element.value.length === 0 : (element.textContent ?? "").length === 0;
          if (!cleared) {
            if (textControl) {
              const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
              const valueSetter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
              if (valueSetter) valueSetter.call(element, ""); else element.value = "";
            } else {
              element.replaceChildren();
            }
            element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "deleteContentBackward" }));
          }
        }
        if (!inserted) return { notEditable: true };
        element.dispatchEvent(new Event("change", { bubbles: true }));
        return { ok: true };
      } catch (error) {
        return { invalidSelector: true, message: String(error) };
      }
    })()`);
    if (result.invalidSelector) throw new Error(`Invalid selector for type: ${result.message.slice(0, 300)}`);
    if (result.notFound) throw new Error("No element matched that selector to type into.");
    if (result.notEditable) throw new Error("That element is not an editable text field.");
    return { typed: true };
  });

  const press = (input) => run(async () => {
    await send("Input.setIgnoreInputEvents", { ignore: false });
    const sequence = makePreviewKeySequence(input, { isMac: platform === "darwin" });
    const previouslyFocused = getFocusedWebContents();
    let keyDownSent = false;
    try {
      // Focus the guest WebContents itself, not its containing window, so keyboard dispatch works
      // for a backgrounded preview; the previous renderer focus is always restored afterwards.
      wc.focus();
      await send("Page.bringToFront");
      await send("Emulation.setFocusEmulationEnabled", { enabled: true });
      keyDownSent = true;
      await send("Input.dispatchKeyEvent", sequence.keyDown);
    } finally {
      if (keyDownSent) await send("Input.dispatchKeyEvent", sequence.keyUp).catch(() => undefined);
      await send("Emulation.setFocusEmulationEnabled", { enabled: false }).catch(() => undefined);
      if (previouslyFocused && previouslyFocused.id !== wc.id && !previouslyFocused.isDestroyed()) {
        try { previouslyFocused.focus(); } catch { /* focus restoration is best-effort */ }
      }
    }
    return { pressed: input.key };
  });

  const scroll = (input) => run(async () => {
    await send("Runtime.enable");
    const locator = locatorOf(input);
    if (locator) await ensureInjected();
    const target = locator
      ? `(() => { const injected = globalThis.${injectedGlobal}; return injected.querySelector(injected.parseSelector(${JSON.stringify(locator)}), document, true); })()`
      : "window";
    const result = await evaluate(`(() => {
      try {
        const target = ${target};
        if (!target) return { notFound: true };
        target.scrollBy({ left: ${Number(input.deltaX) || 0}, top: ${Number(input.deltaY) || 0}, behavior: "instant" });
        return { ok: true };
      } catch (error) {
        return { invalidSelector: true, message: String(error) };
      }
    })()`);
    if (result.invalidSelector) throw new Error(`Invalid selector for scroll: ${result.message.slice(0, 300)}`);
    if (result.notFound) throw new Error("No element matched that selector to scroll.");
    return { scrolled: true };
  });

  const evaluateExpression = (input) => run(async () => {
    await send("Runtime.enable");
    const value = await evaluate(input.expression, {
      returnByValue: input.returnByValue ?? true,
      awaitPromise: input.awaitPromise ?? true,
    });
    const actualBytes = Buffer.byteLength(JSON.stringify(value) ?? "", "utf8");
    if (actualBytes > MAX_EVALUATION_BYTES) {
      throw new Error(`The evaluation result is ${actualBytes} bytes; keep results under ${MAX_EVALUATION_BYTES} bytes.`);
    }
    return { value };
  });

  const waitFor = (input) => run(async () => {
    const timeoutMs = Math.min(Math.max(Number(input.timeoutMs) || DEFAULT_WAIT_TIMEOUT_MS, 1), MAX_WAIT_TIMEOUT_MS);
    await send("Runtime.enable");
    const locator = locatorOf(input);
    if (locator) await ensureInjected();
    const deadline = Date.now() + timeoutMs;
    while (Date.now() <= deadline) {
      const result = await evaluate(`(() => {
        try {
          const selectorMatched = ${locator ? `(() => { const injected = globalThis.${injectedGlobal}; return injected.querySelector(injected.parseSelector(${JSON.stringify(locator)}), document, false) !== null; })()` : "true"};
          const textMatched = ${input.text ? `(document.body?.innerText || "").includes(${JSON.stringify(String(input.text))})` : "true"};
          const urlMatched = ${input.urlIncludes ? `location.href.includes(${JSON.stringify(String(input.urlIncludes))})` : "true"};
          return { matched: selectorMatched && textMatched && urlMatched };
        } catch (error) {
          return { invalidSelector: true, message: String(error) };
        }
      })()`);
      if (result.invalidSelector) throw new Error(`Invalid selector for wait_for: ${result.message.slice(0, 300)}`);
      if (result.matched) return { matched: true };
      await sleep(WAIT_FOR_POLL_MS);
    }
    throw new Error(`The condition did not hold within ${timeoutMs}ms.`);
  });

  const snapshot = () => run(async () => {
    await send("Runtime.enable");
    const page = await evaluate(SNAPSHOT_PAGE_EXPRESSION);
    return page;
  });

  const detach = () => {
    try { if (!wc.isDestroyed() && wc.debugger.isAttached()) wc.debugger.detach(); } catch { /* already gone */ }
  };

  return { click, type, press, scroll, evaluateExpression, waitFor, snapshot, detach };
}

module.exports = { createPreviewDriver, MAX_EVALUATION_BYTES, DEFAULT_WAIT_TIMEOUT_MS };
