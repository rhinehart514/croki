import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

import { launchChrome } from "../lib/cdp.mjs";
import {
  ROOT,
  assertAxeNoCritical,
  assertBasicAccessibility,
  assertNoUnhandledRejections,
  freePort,
  summonMap,
  waitForDom,
} from "./browser-harness.mjs";

export const ATLAS_EVIDENCE_DIR = path.join(ROOT, "docs/design/evidence/venture-atlas");

function signFounderRequest(secret, method, rawUrl) {
  const url = new URL(rawUrl);
  const requestPath = `${url.pathname}${url.search}`;
  const issuedAt = Date.now();
  const nonce = crypto.randomBytes(18).toString("base64url");
  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${method.toUpperCase()}\n${requestPath}\n${issuedAt}\n${nonce}`)
    .digest("base64url");
  return `v1.${issuedAt}.${nonce}.${signature}`;
}

async function installFounderHost(client, base, secret) {
  client.on("Fetch.requestPaused", ({ requestId, request }) => {
    const headers = Object.entries({
      ...request.headers,
      "x-drover-founder-capability": signFounderRequest(secret, request.method, request.url),
    }).map(([name, value]) => ({ name, value: String(value) }));
    void client.send("Fetch.continueRequest", { requestId, headers }).catch(() => {});
  });
  await client.send("Fetch.enable", {
    patterns: [{ urlPattern: `${base}/api/*`, requestStage: "Request" }],
  });
}

export async function openAtlasFixture(drover, {
  ventureName = drover.fixture.venture.name,
  width = 1920,
  height = 1080,
  reducedMotion = false,
  openVenture = true,
} = {}) {
  const chrome = await launchChrome({
    port: await freePort(),
    url: drover.base,
    beforeNavigate: async (client) => {
      await client.send("Emulation.setDeviceMetricsOverride", {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await client.send("Emulation.setEmulatedMedia", {
        features: [{ name: "prefers-reduced-motion", value: reducedMotion ? "reduce" : "no-preference" }],
      });
      await installFounderHost(client, drover.base, drover.founderCapability);
    },
  });
  const { client } = chrome;
  await waitForDom(client, `/Resume work/i.test(document.body.textContent)`, "atlas fixture venture picker did not render");
  if (!openVenture) return chrome;
  const opened = await client.evaluate(`(() => {
    const button = [...document.querySelectorAll('button')]
      .find((entry) => entry.textContent.includes(${JSON.stringify(ventureName)}));
    button?.click();
    return Boolean(button);
  })()`);
  assert.equal(opened, true, `could not open ${ventureName}`);
  // Workbench-first hierarchy: the workspace opens on the adaptive workbench, and the venture graph is a
  // summoned mode. The atlas journeys are entirely about the plane, so opening the atlas fixture summons the
  // map as part of "open" — the returned surface is the mounted venture graph, exactly as these journeys
  // assume immediately after opening.
  await waitForDom(
    client,
    `!!document.querySelector('.venture-workspace [data-testid="venture-workbench"]')`,
    `${ventureName} did not open the venture workspace on the workbench`,
  );
  await summonMap(client);
  return chrome;
}

export async function setAtlasViewport(client, { width, height, reducedMotion = false }) {
  await client.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await client.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: reducedMotion ? "reduce" : "no-preference" }],
  });
  await client.evaluate("new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
}

export async function setBrowserZoom(client, { physicalWidth = 1920, physicalHeight = 1080, percent }) {
  const scale = percent / 100;
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: Math.round(physicalWidth / scale),
    height: Math.round(physicalHeight / scale),
    deviceScaleFactor: scale,
    mobile: false,
  });
  await client.evaluate("new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
}

function safeName(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function paeth(left, above, upperLeft) {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  return leftDistance <= aboveDistance && leftDistance <= upperLeftDistance ? left : aboveDistance <= upperLeftDistance ? above : upperLeft;
}

function findBlackPaintBlocks(png) {
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = null;
  const compressed = [];
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString("ascii", offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      assert.equal(data[8], 8, "Chrome evidence must use 8-bit PNG pixels");
      colorType = data[9];
      assert.equal(data[12], 0, "Chrome evidence must be non-interlaced for paint validation");
    } else if (type === "IDAT") compressed.push(data);
    offset += length + 12;
    if (type === "IEND") break;
  }
  const bytesPerPixel = colorType === 6 ? 4 : colorType === 2 ? 3 : null;
  assert.ok(bytesPerPixel && width && height, `unsupported Chrome evidence PNG color type ${colorType}`);
  const packed = zlib.inflateSync(Buffer.concat(compressed));
  const stride = width * bytesPerPixel;
  const pixels = Buffer.alloc(stride * height);
  let packedOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = packed[packedOffset++];
    for (let x = 0; x < stride; x += 1) {
      const raw = packed[packedOffset++];
      const left = x >= bytesPerPixel ? pixels[y * stride + x - bytesPerPixel] : 0;
      const above = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const upperLeft = y > 0 && x >= bytesPerPixel ? pixels[(y - 1) * stride + x - bytesPerPixel] : 0;
      const value = filter === 0 ? raw
        : filter === 1 ? raw + left
          : filter === 2 ? raw + above
            : filter === 3 ? raw + Math.floor((left + above) / 2)
              : filter === 4 ? raw + paeth(left, above, upperLeft)
                : NaN;
      assert.ok(Number.isFinite(value), `unsupported PNG scanline filter ${filter}`);
      pixels[y * stride + x] = value & 255;
    }
  }
  const blockSize = 48;
  const corruptBlocks = [];
  for (let top = 0; top + blockSize <= height; top += blockSize) {
    for (let left = 0; left + blockSize <= width; left += blockSize) {
      let nearBlack = 0;
      for (let y = top; y < top + blockSize; y += 2) {
        for (let x = left; x < left + blockSize; x += 2) {
          const pixel = y * stride + x * bytesPerPixel;
          if ((pixels[pixel] < 12 && pixels[pixel + 1] < 12 && pixels[pixel + 2] < 12)
            || (bytesPerPixel === 4 && pixels[pixel + 3] < 64)) nearBlack += 1;
        }
      }
      if (nearBlack / ((blockSize / 2) ** 2) > 0.88) corruptBlocks.push({ left, top });
    }
  }
  // A partially painted Chrome surface can contain large dark rectangles whose antialiased edge
  // pixels are too light for the strict near-black check above. Treat connected, edge-touching
  // regions as corruption at a more tolerant threshold; legitimate dark controls occupy only one
  // or two cells and cannot form the broad edge components this catches.
  const edgeBlockSize = 32;
  const columns = Math.floor(width / edgeBlockSize);
  const rows = Math.floor(height / edgeBlockSize);
  const darkCells = new Set();
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      let dark = 0;
      for (let y = row * edgeBlockSize; y < (row + 1) * edgeBlockSize; y += 2) {
        for (let x = column * edgeBlockSize; x < (column + 1) * edgeBlockSize; x += 2) {
          const pixel = y * stride + x * bytesPerPixel;
          if ((pixels[pixel] < 42 && pixels[pixel + 1] < 42 && pixels[pixel + 2] < 42)
            || (bytesPerPixel === 4 && pixels[pixel + 3] < 64)) dark += 1;
        }
      }
      if (dark / ((edgeBlockSize / 2) ** 2) > 0.7) darkCells.add(`${column}:${row}`);
    }
  }
  const visited = new Set();
  for (const key of darkCells) {
    if (visited.has(key)) continue;
    const pending = [key];
    const component = [];
    let touchesEdge = false;
    while (pending.length) {
      const current = pending.pop();
      if (visited.has(current) || !darkCells.has(current)) continue;
      visited.add(current);
      component.push(current);
      const [column, row] = current.split(":").map(Number);
      if (column === 0 || row === 0 || column === columns - 1 || row === rows - 1) touchesEdge = true;
      for (const [nextColumn, nextRow] of [[column - 1, row], [column + 1, row], [column, row - 1], [column, row + 1]]) {
        if (nextColumn >= 0 && nextRow >= 0 && nextColumn < columns && nextRow < rows) pending.push(`${nextColumn}:${nextRow}`);
      }
    }
    if (touchesEdge && component.length >= 6) {
      const coordinates = component.map((entry) => entry.split(":").map(Number));
      const componentColumns = coordinates.map(([column]) => column);
      const componentRows = coordinates.map(([, row]) => row);
      corruptBlocks.push({
        kind: "edge-connected-dark-region",
        cells: component.length,
        left: Math.min(...componentColumns) * edgeBlockSize,
        top: Math.min(...componentRows) * edgeBlockSize,
        right: (Math.max(...componentColumns) + 1) * edgeBlockSize,
        bottom: (Math.max(...componentRows) + 1) * edgeBlockSize,
      });
    }
  }
  return corruptBlocks;
}

export async function captureAtlasEvidence(client, name) {
  fs.mkdirSync(ATLAS_EVIDENCE_DIR, { recursive: true });
  await client.send("Page.bringToFront");
  const file = path.join(ATLAS_EVIDENCE_DIR, `${safeName(name)}.png`);
  const viewport = await client.evaluate(`({ width: innerWidth, height: innerHeight, deviceScaleFactor: devicePixelRatio })`);
  let lastCorruptBlocks = [];
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    await client.evaluate("new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(resolve))))");
    const screenshot = await client.send("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
      captureBeyondViewport: false,
    });
    assert.ok(screenshot.data.length > 1_000, "atlas evidence screenshot was unexpectedly empty");
    const png = Buffer.from(screenshot.data, "base64");
    lastCorruptBlocks = findBlackPaintBlocks(png);
    if (lastCorruptBlocks.length === 0) {
      fs.writeFileSync(file, png);
      return file;
    }
    // Force Chrome to allocate and paint a fresh surface before retrying. Reapplying identical
    // metrics can retain corrupt transparent tiles; a one-pixel intermediate surface cannot.
    await client.send("Emulation.setDeviceMetricsOverride", {
      width: viewport.width + 1,
      height: viewport.height,
      deviceScaleFactor: viewport.deviceScaleFactor,
      mobile: false,
    });
    await client.evaluate("new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
    await client.send("Emulation.setDeviceMetricsOverride", {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: viewport.deviceScaleFactor,
      mobile: false,
    });
    await client.send("Page.bringToFront");
  }
  assert.fail(`Chrome evidence contains ${lastCorruptBlocks.length} near-black compositor blocks after four settled captures; sample: ${JSON.stringify(lastCorruptBlocks.slice(0, 20))}`);
}

export async function clickButton(client, name) {
  return client.evaluate(`(() => {
    const pattern = new RegExp(${JSON.stringify(name.source)}, ${JSON.stringify(name.flags)});
    const button = [...document.querySelectorAll('button')].find((entry) => pattern.test(entry.getAttribute('aria-label') || entry.textContent || ''));
    button?.click();
    return Boolean(button);
  })()`);
}

export async function selectAtlasElement(client, accessibleName) {
  const target = await client.evaluate(`(() => {
    const pattern = new RegExp(${JSON.stringify(accessibleName.source)}, ${JSON.stringify(accessibleName.flags)});
    const button = [...document.querySelectorAll('.atlas-element-main, [data-atlas-kind] button')]
      .find((entry) => pattern.test(entry.getAttribute('aria-label') || entry.textContent || ''));
    const rect = button?.getBoundingClientRect();
    const element = button?.closest('.atlas-element');
    return rect ? {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      width: rect.width,
      height: rect.height,
      atlasId: element?.dataset.atlasId,
      withinViewport: rect.right > 0 && rect.bottom > 0 && rect.left < innerWidth && rect.top < innerHeight,
      unobscured: document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)?.closest('.atlas-element') === element,
    } : null;
  })()`);
  assert.ok(target && target.atlasId && target.width > 0 && target.height > 0, `could not select atlas element ${accessibleName}`);
  await client.evaluate(`(() => {
    const pattern = new RegExp(${JSON.stringify(accessibleName.source)}, ${JSON.stringify(accessibleName.flags)});
    [...document.querySelectorAll('.atlas-element-main, [data-atlas-kind] button')]
      .find((entry) => pattern.test(entry.getAttribute('aria-label') || entry.textContent || ''))?.click();
  })()`);
  await waitForDom(client, `[...document.querySelectorAll('.atlas-element[data-selected="true"]')].some((entry) => entry.dataset.atlasId === ${JSON.stringify(target.atlasId)})`, `selection did not settle for ${accessibleName}`);
}

// NOTE: there is no standalone ".atlas-wall" landmark to assert anymore — founder decisions live
// in-context per bet (NowRail's "Needs you" toggle + a descended bet's .now-gate blocks), not behind a
// single global wall panel. Each journey file that needs wall-reachability proves it per-file (see
// wall-journey.mjs) instead of this shared viewport helper asserting a dead selector.
export async function assertAtlasViewport(client, { width, height, reducedMotion }) {
  const state = await client.evaluate(`(() => {
    const root = document.querySelector('.venture-workspace');
    const canvas = document.querySelector('.venture-canvas-flow.atlas-canvas');
    const composer = document.querySelector('.venture-workspace-dock .now-composer textarea');
    const visible = (element) => {
      if (!element) return false;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.bottom > 0
        && rect.left < innerWidth && rect.top < innerHeight
        && style.display !== 'none' && style.visibility !== 'hidden';
    };
    return {
      width: innerWidth,
      height: innerHeight,
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      root: visible(root),
      canvas: visible(canvas),
      composer: visible(composer),
      overflowX: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth) - innerWidth,
      permanentInspector: Boolean(document.querySelector('.atlas-inspector, [data-atlas-inspector], [aria-label*="architecture inspector" i]')),
      dashboard: Boolean(document.querySelector('.atlas-dashboard, [data-atlas-dashboard]')),
    };
  })()`);
  assert.equal(state.width, width);
  assert.equal(state.height, height);
  assert.equal(state.reducedMotion, reducedMotion);
  assert.equal(state.root, true, "workspace root must remain visible");
  assert.equal(state.canvas, true, "canvas must fill the workbench plane");
  assert.equal(state.composer, true, "continuous composer must remain reachable");
  assert.ok(state.overflowX <= 1, `workspace introduced ${state.overflowX}px page overflow`);
  assert.equal(state.permanentInspector, false, "workspace regressed to a permanent inspector");
  assert.equal(state.dashboard, false, "workspace regressed to a dashboard composition");
  return state;
}

export async function assertReducedMotionSettled(client, {
  context = "document.querySelector('[data-venture-atlas], .venture-atlas')",
  label = "venture atlas",
} = {}) {
  const offenders = await client.evaluate(`(() => {
    const root = ${context};
    if (!root) return [{ missingContext: true }];
    const durationMs = (value) => String(value || '0s').split(',').reduce((maximum, entry) => {
      const duration = entry.trim();
      const numeric = parseFloat(duration) || 0;
      return Math.max(maximum, duration.endsWith('ms') ? numeric : numeric * 1000);
    }, 0);
    return [root, ...root.querySelectorAll('*')]
      .filter((element) => {
        const style = getComputedStyle(element);
        return durationMs(style.animationDuration) > 10 || durationMs(style.transitionDuration) > 10;
      })
      .slice(0, 20)
      .map((element) => ({
        tag: element.tagName,
        className: element.className?.baseVal || element.className || '',
        animation: getComputedStyle(element).animationDuration,
        transition: getComputedStyle(element).transitionDuration,
      }));
  })()`);
  assert.deepEqual(offenders, [], `${label} reduced motion left choreography active: ${JSON.stringify(offenders)}`);
}

export async function pressKeyboardKey(client, key, { shift = false } = {}) {
  const modifiers = shift ? 8 : 0;
  const code = key === " " ? "Space" : key;
  const virtualKeyCode = { Tab: 9, Enter: 13, Escape: 27, " ": 32, ArrowUp: 38, ArrowDown: 40, Home: 36, End: 35 }[key] ?? 0;
  const event = { key, code, modifiers, windowsVirtualKeyCode: virtualKeyCode, nativeVirtualKeyCode: virtualKeyCode };
  const text = key === "Enter" ? "\r" : key === " " ? " " : undefined;
  await client.send("Input.dispatchKeyEvent", { type: "keyDown", ...event, ...(text ? { text, unmodifiedText: text } : {}) });
  await client.send("Input.dispatchKeyEvent", { type: "keyUp", ...event });
}

export async function focusedKeyboardTarget(client) {
  return client.evaluate(`(() => {
    const element = document.activeElement;
    const node = element?.closest?.('.react-flow__node');
    const edge = element?.closest?.('.react-flow__edge');
    return {
      tag: element?.tagName || null,
      id: element?.id || null,
      className: element?.className?.baseVal || element?.className || '',
      sceneId: node?.dataset.id || null,
      edgeId: edge?.dataset.id || null,
      domIndex: element ? [...document.querySelectorAll('*')].indexOf(element) : -1,
      role: element?.getAttribute?.('role') || null,
      name: (element?.getAttribute?.('aria-label') || element?.getAttribute?.('title') || element?.textContent || '').replace(/\\s+/g, ' ').trim(),
      pressed: element?.getAttribute?.('aria-pressed') || null,
    };
  })()`);
}

export async function collectKeyboardTabOrder(client, { limit = 120 } = {}) {
  const entries = [];
  const fingerprints = new Set();
  for (let index = 0; index < limit; index += 1) {
    await pressKeyboardKey(client, "Tab");
    const target = await focusedKeyboardTarget(client);
    const fingerprint = JSON.stringify([target.domIndex, target.sceneId, target.edgeId]);
    if (fingerprints.has(fingerprint)) break;
    fingerprints.add(fingerprint);
    entries.push(target);
  }
  return entries;
}

export async function focusKeyboardTarget(client, predicate, message, { limit = 120 } = {}) {
  for (let index = 0; index < limit; index += 1) {
    await pressKeyboardKey(client, "Tab");
    const target = await focusedKeyboardTarget(client);
    if (predicate(target)) return target;
  }
  assert.fail(message);
}

export async function assertVisibleKeyboardFocus(client, label) {
  const focus = await client.evaluate(`(() => {
    const element = document.activeElement;
    if (!element || element === document.body) return null;
    const candidates = [element, element.parentElement, element.parentElement?.parentElement].filter(Boolean);
    const treatment = candidates.map((candidate) => {
      const style = getComputedStyle(candidate);
      return {
        owner: candidate === element ? 'active' : candidate.tagName + '.' + (candidate.className || ''),
        outlineWidth: parseFloat(style.outlineWidth || '0') || 0,
        outlineStyle: style.outlineStyle,
        boxShadow: style.boxShadow || '',
      };
    }).find((candidate) => (candidate.outlineStyle !== 'none' && candidate.outlineWidth >= 2) || candidate.boxShadow !== 'none') ?? null;
    const rect = element.getBoundingClientRect();
    return {
      visible: rect.width > 0 && rect.height > 0,
      focusVisible: element.matches(':focus-visible'),
      treatment,
    };
  })()`);
  assert.ok(focus?.visible, `${label} focus target is not visible`);
  assert.equal(focus.focusVisible, true, `${label} does not match :focus-visible`);
  assert.ok(focus.treatment, `${label} has no visible focus treatment: ${JSON.stringify(focus)}`);
  return focus;
}

export async function assertAtlasAccessibility(client) {
  await assertBasicAccessibility(client);
  await assertAxeNoCritical(client, {
    context: "document.querySelector('.venture-workspace')",
    label: "venture workspace",
  });
  // The outline ("o") is the deterministic keyboard access path now, not a permanent visible toggle
  // button — so accessible-name coverage is checked generically (assertBasicAccessibility above) rather
  // than for a specific "outline" labelled button that no longer exists as chrome.
  const canvasContract = await client.evaluate(`(() => ({
    unnamedButtons: [...document.querySelectorAll('.venture-workspace button')]
      .filter((button) => !(button.getAttribute('aria-label') || button.textContent || '').trim())
      .map((button) => button.outerHTML.slice(0, 160)),
  }))()`);
  assert.deepEqual(canvasContract.unnamedButtons, []);
  await assertNoUnhandledRejections(client);
}

export async function dragBy(client, selector, deltaX, deltaY) {
  const rect = await client.evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    const value = element?.getBoundingClientRect();
    if (!value) return null;
    if (${JSON.stringify(selector)} === '.react-flow__pane') {
      for (let y = value.top + 60; y < value.bottom - 60; y += 50) {
        for (let x = value.left + 60; x < value.right - 60; x += 50) {
          if (document.elementFromPoint(x, y)?.classList.contains('react-flow__pane')) return { x, y };
        }
      }
    }
    if (element.classList.contains('react-flow__node')) {
      for (let y = value.top + 8; y < value.bottom - 8; y += 12) {
        for (let x = value.left + 8; x < value.right - 8; x += 12) {
          if (document.elementFromPoint(x, y)?.closest('.react-flow__node') === element) return { x, y };
        }
      }
    }
    return { x: value.left + value.width / 2, y: value.top + value.height / 2 };
  })()`);
  assert.ok(rect, `could not drag missing element ${selector}`);
  await client.send("Input.dispatchMouseEvent", { type: "mousePressed", x: rect.x, y: rect.y, button: "left", clickCount: 1 });
  for (let step = 1; step <= 8; step += 1) {
    await client.send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: rect.x + (deltaX * step) / 8,
      y: rect.y + (deltaY * step) / 8,
      button: "left",
      buttons: 1,
    });
  }
  await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: rect.x + deltaX, y: rect.y + deltaY, button: "left", clickCount: 1 });
}

export async function waitForAtlas(client, expression, message) {
  return waitForDom(client, expression, message);
}
