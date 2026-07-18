#!/usr/bin/env node

// The ?shell=canvas resting-machine journey. Locks the gains the canvas seed + territory-in-sim +
// rank-and-reveal changes make (STATE.md verification debt): the resting canvas reads as the Product+GTM
// MACHINE, not a crowded scatter. At 1440x900 it asserts, against the real built UI:
//   • FRAME — the workspace mounts: left index + canvas plane + dock composer.
//   • RESTING — nodes do NOT overlap (bounding-box check), show distinct titles across >=2 kinds, and both
//     the Product and Go-to-market territory kickers render.
//   • SCOPE — a single click on a node scopes the composer (loses "Direct the venture") WITHOUT a details
//     detour (no stage-workspace opens).
//   • DESCEND — a double-click descends into a .stage-workspace over a STILL-mounted, dimmed canvas with a
//     heading.
//   • ESCAPE ladder — first Escape returns from descent (canvas un-dims, scope survives); second Escape
//     broadens back to the whole venture ("Direct the venture" restored).
//   • No unhandled console rejections.
//
// Reuses the browser harness (bootFixture spawns the built UI server with a venture pre-seeded so the
// picker shows "Open canvas") and the CDP client. The picker is shell-agnostic, so navigating with
// ?shell=canvas and clicking the venture lands in VentureWorkspace.

import assert from "node:assert/strict";
import crypto from "node:crypto";
import { test } from "node:test";

import { launchChrome } from "./lib/cdp.mjs";
import {
  bootFixture,
  freePort,
  waitForDom,
  waitForCanvasViewportStable,
  setNetworkOffline,
  assertNoUnhandledRejections,
} from "./fixtures/browser-harness.mjs";
import {
  createCanvasVentureFixture,
  createDenseVentureFixture,
  createEmptyCanvasVentureFixture,
} from "../fixtures/firm-fixtures.mjs";

const VIEWPORT = { width: 1440, height: 900 };

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

// Open the seeded venture in the canvas shell: navigate with ?shell=canvas, click the venture row, and
// wait for the VentureWorkspace frame. (openFixtureVenture in the harness is default-shell only — it
// hardcodes drover.base and waits for [data-venture-atlas], which this shell does not render.)
async function openCanvasVenture(drover) {
  const chrome = await launchChrome({
    port: await freePort(),
    url: `${drover.base}/?shell=canvas`,
    beforeNavigate: async (client) => {
      await client.send("Emulation.setDeviceMetricsOverride", {
        width: VIEWPORT.width,
        height: VIEWPORT.height,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await client.send("Emulation.setEmulatedMedia", {
        features: [{ name: "prefers-reduced-motion", value: "no-preference" }],
      });
      await installFounderHost(client, drover.base, drover.founderCapability);
    },
  });
  const { client } = chrome;
  await waitForDom(client, `/Continue a venture/i.test(document.body.textContent)`, "canvas venture picker did not render");
  const opened = await client.evaluate(`(() => {
    const button = [...document.querySelectorAll('button')]
      .find((entry) => entry.textContent.includes(${JSON.stringify(drover.fixture.venture.name)}));
    button?.click();
    return Boolean(button);
  })()`);
  assert.equal(opened, true, `could not open ${drover.fixture.venture.name}`);
  await waitForDom(
    client,
    `!!document.querySelector('.venture-workspace .venture-canvas-flow.atlas-canvas')`,
    "canvas workspace did not open",
  );
  await waitForCanvasViewportStable(client);
  await client.evaluate("new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  return chrome;
}

// Fire a real click / double-click on a canvas node, at its on-screen centre, through the SAME DOM path
// the founder's pointer takes: the event is dispatched on the .react-flow__node wrapper so React Flow's
// own onNodeClick / onNodeDoubleClick handlers run (a raw CDP mouse press-release is intercepted by React
// Flow's pointer-based drag layer before it resolves to a click, so a faithful native MouseEvent on the
// node is the deterministic single/double-click path).
async function fireNode(client, id, kind) {
  const fired = await client.evaluate(`(() => {
    const node = document.querySelector('.react-flow__node[data-id=${JSON.stringify(id)}]');
    if (!node) return false;
    const r = node.getBoundingClientRect();
    const opts = { bubbles: true, cancelable: true, view: window, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
    node.dispatchEvent(new MouseEvent(${JSON.stringify(kind)}, opts));
    return true;
  })()`);
  assert.ok(fired, `node ${id} was not on screen to ${kind}`);
}

async function pressEscape(client) {
  await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
}

// A single lowercase-letter key press (e.g. "l" for the lens, "a" for the generated answer). The keyCode
// is the uppercase letter's char code, which is what a physical key emits.
async function pressLetter(client, letter) {
  const code = `Key${letter.toUpperCase()}`;
  const vk = letter.toUpperCase().charCodeAt(0);
  await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: letter, code, text: letter, windowsVirtualKeyCode: vk });
  await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: letter, code, windowsVirtualKeyCode: vk });
}

// Snapshot every rendered canvas node's exact on-screen top-left pixel + the id-set. The FLIP restore
// covenant is pixel-exact by construction, so a lens enter → Escape must return every id to this frame.
async function snapshotNodeFrame(client) {
  return client.evaluate(`(() => {
    const out = {};
    for (const n of document.querySelectorAll('.venture-workspace .react-flow__node[data-id]')) {
      const r = n.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      out[n.getAttribute('data-id')] = { left: Math.round(r.left), top: Math.round(r.top) };
    }
    return out;
  })()`);
}

test("?shell=canvas rests as the Product+GTM machine and descends without a details detour", async () => {
  const drover = await bootFixture(createCanvasVentureFixture);
  const chrome = await openCanvasVenture(drover);
  const { client } = chrome;
  try {
    // FRAME — index + canvas plane + dock composer all mounted; canvas resting (not descended).
    const frame = await client.evaluate(`(() => ({
      index: Boolean(document.querySelector('.venture-workspace .vw-index')),
      canvas: Boolean(document.querySelector('.venture-workspace .venture-canvas-flow.atlas-canvas')),
      restingStage: document.querySelector('.venture-canvas-stage')?.getAttribute('data-dimmed'),
      dock: (() => { const t = document.querySelector('.venture-workspace-dock .now-composer textarea'); return t ? t.getAttribute('placeholder') : null; })(),
      descended: Boolean(document.querySelector('[data-testid="stage-workspace"]')),
    }))()`);
    assert.equal(frame.canvas, true, "canvas plane did not mount");
    assert.equal(frame.index, true, "workspace index did not mount");
    assert.equal(frame.restingStage, "false", "canvas started dimmed/descended instead of at rest");
    assert.equal(frame.dock, "Direct the venture", "dock composer did not show the whole-venture placeholder");
    assert.equal(frame.descended, false, "a stage-workspace was open at rest");

    // RESTING — collision-free by construction (no two placed cards overlap), distinct titles across
    // >=2 kinds, and BOTH territory kickers rendered.
    const resting = await client.evaluate(`(() => {
      const nodes = [...document.querySelectorAll('.venture-workspace .react-flow__node')]
        .map((n) => {
          const r = n.getBoundingClientRect();
          const el = n.querySelector('[data-atlas-kind], [data-kind]');
          return {
            id: n.getAttribute('data-id'),
            kind: el?.getAttribute('data-atlas-kind') || el?.getAttribute('data-kind') || null,
            title: (n.querySelector('strong')?.textContent || '').trim(),
            left: r.left, top: r.top, right: r.right, bottom: r.bottom, w: r.width, h: r.height,
          };
        })
        .filter((n) => n.w > 0 && n.h > 0);
      const overlaps = [];
      for (let i = 0; i < nodes.length; i += 1) {
        for (let j = i + 1; j < nodes.length; j += 1) {
          const a = nodes[i]; const b = nodes[j];
          if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) overlaps.push([a.id, b.id]);
        }
      }
      const titledKinds = [...new Set(nodes.filter((n) => n.title).map((n) => n.kind))];
      const distinctTitles = [...new Set(nodes.map((n) => n.title).filter(Boolean))];
      const kickers = [...document.querySelectorAll('.canvas-territory-kicker')]
        .map((k) => ({ territory: k.getAttribute('data-territory'), text: (k.textContent || '').trim() }));
      return { count: nodes.length, overlaps, titledKinds, distinctTitles, kickers };
    })()`);
    assert.ok(resting.count >= 4, `too few resting cards to read as a machine: ${resting.count}`);
    assert.deepEqual(resting.overlaps, [], `resting cards overlap: ${JSON.stringify(resting.overlaps)}`);
    assert.ok(resting.titledKinds.length >= 2, `resting cards span too few kinds: ${JSON.stringify(resting.titledKinds)}`);
    assert.ok(resting.distinctTitles.length >= 2, `resting cards do not carry distinct titles: ${JSON.stringify(resting.distinctTitles)}`);
    const territories = new Set(resting.kickers.map((k) => k.territory));
    assert.ok(territories.has("product"), `Product territory kicker missing: ${JSON.stringify(resting.kickers)}`);
    assert.ok(territories.has("gtm"), `Go-to-market territory kicker missing: ${JSON.stringify(resting.kickers)}`);

    // FELT SPLIT — the two-territory geography reads at the arrival zoom, not as a radial constellation.
    // Against the real built DOM at 1440x900: Product-territory cards occupy the LEFT of the seam, GTM the
    // RIGHT, with a clear gutter between the two populations; the two territory labels sit LEFT (Product) vs
    // RIGHT (Go-to-market) over their own half-planes, and the seam spine renders between them. Membership is
    // read from the card's own data-territory (stamped by the same facet the layout seeds from), so this
    // asserts the RENDERED geography, never a re-derivation from position.
    const split = await client.evaluate(`(() => {
      const flow = document.querySelector('.venture-workspace .venture-canvas-flow');
      const nodes = [...document.querySelectorAll('.venture-workspace .react-flow__node')]
        .map((n) => {
          const r = n.getBoundingClientRect();
          const el = n.querySelector('[data-territory]');
          return { id: n.getAttribute('data-id'), territory: el?.getAttribute('data-territory') || null, cx: (r.left + r.right) / 2, left: r.left, right: r.right, w: r.width };
        })
        .filter((n) => n.w > 0);
      const product = nodes.filter((n) => n.territory === 'product');
      const gtm = nodes.filter((n) => n.territory === 'gtm');
      const kickers = [...document.querySelectorAll('.canvas-territory-kicker')].map((k) => {
        const r = k.getBoundingClientRect();
        return { territory: k.getAttribute('data-territory'), cx: (r.left + r.right) / 2 };
      });
      const seam = document.querySelector('.canvas-territory-seam');
      return {
        productCount: product.length,
        gtmCount: gtm.length,
        productMaxRight: product.length ? Math.max(...product.map((n) => n.right)) : null,
        gtmMinLeft: gtm.length ? Math.min(...gtm.map((n) => n.left)) : null,
        productKickerCx: kickers.find((k) => k.territory === 'product')?.cx ?? null,
        gtmKickerCx: kickers.find((k) => k.territory === 'gtm')?.cx ?? null,
        seamRendered: Boolean(seam),
        seamVisible: seam?.getAttribute('data-visible') === 'true',
      };
    })()`);
    // Both territories are actually populated on the canvas (otherwise "left vs right" is untestable).
    assert.ok(split.productCount >= 1, `no product-territory cards rendered to prove the split: ${JSON.stringify(split)}`);
    assert.ok(split.gtmCount >= 1, `no gtm-territory cards rendered to prove the split: ${JSON.stringify(split)}`);
    // The Product population sits clearly LEFT of the GTM population, with a real gutter between them: the
    // rightmost product card's right edge is left of the leftmost gtm card's left edge.
    assert.ok(
      split.productMaxRight < split.gtmMinLeft,
      `Product and GTM populations are not left/right separated with a gutter: productMaxRight=${split.productMaxRight}, gtmMinLeft=${split.gtmMinLeft}`,
    );
    // The two territory LABELS sit on their populations' sides — Product left of Go-to-market — not top/bottom.
    assert.ok(
      split.productKickerCx !== null && split.gtmKickerCx !== null && split.productKickerCx < split.gtmKickerCx,
      `territory labels are not positioned Product-left / GTM-right: ${JSON.stringify(split)}`,
    );
    // The seam spine renders between the two territories at the structure band.
    assert.equal(split.seamRendered, true, "seam spine did not render");
    assert.equal(split.seamVisible, true, "seam spine was not visible at the arrival structure band");

    // SCOPE — a single click on a bet node scopes the composer WITHOUT opening the stage workspace.
    const betId = await client.evaluate(`document.querySelector('.venture-workspace .react-flow__node[data-id^="bet:"]')?.getAttribute('data-id') || null`);
    assert.ok(betId, "no bet node on the canvas to scope");
    await fireNode(client, betId, "click");
    await waitForDom(client, `!!document.querySelector('.venture-workspace-dock .now-composer-scope')`, "single click did not scope the composer");
    const afterScope = await client.evaluate(`(() => ({
      scoped: Boolean(document.querySelector('.venture-workspace-dock .now-composer-scope')),
      clearScope: Boolean([...document.querySelectorAll('.venture-workspace-dock button')].find((b) => (b.getAttribute('aria-label') || '').startsWith('Clear scope'))),
      placeholder: document.querySelector('.venture-workspace-dock .now-composer textarea')?.getAttribute('placeholder'),
      descended: Boolean(document.querySelector('[data-testid="stage-workspace"]')),
    }))()`);
    assert.equal(afterScope.scoped, true, "composer did not gain a scope on single click");
    assert.equal(afterScope.clearScope, true, "scoped composer is missing the clear-scope control");
    assert.notEqual(afterScope.placeholder, "Direct the venture", "single click left the whole-venture placeholder");
    assert.equal(afterScope.descended, false, "a single click opened a details workspace instead of only scoping");

    // DESCEND — a double-click descends into a .stage-workspace over the still-mounted, dimmed canvas.
    await fireNode(client, betId, "dblclick");
    await waitForDom(client, `!!document.querySelector('[data-testid="stage-workspace"]')`, "double-click did not descend into the stage workspace");
    const descended = await client.evaluate(`(() => ({
      stageWorkspace: Boolean(document.querySelector('[data-testid="stage-workspace"]')),
      canvasStillMounted: Boolean(document.querySelector('.venture-workspace .venture-canvas-flow.atlas-canvas')),
      dimmed: document.querySelector('.venture-canvas-stage')?.getAttribute('data-dimmed'),
      heading: (document.querySelector('[data-testid="stage-workspace"] h1, [data-testid="stage-workspace"] h2, [data-testid="stage-workspace"] [role="heading"]')?.textContent || '').trim(),
      ariaLabel: document.querySelector('[data-testid="stage-workspace"]')?.getAttribute('aria-label'),
    }))()`);
    assert.equal(descended.stageWorkspace, true, "stage workspace did not mount on descent");
    assert.equal(descended.canvasStillMounted, true, "canvas unmounted under the descent instead of staying mounted");
    assert.equal(descended.dimmed, "true", "canvas did not dim behind the descent");
    assert.equal(descended.ariaLabel, "Descended work", "stage workspace missing its region label");
    assert.ok(descended.heading.length > 0, "descended workspace has no heading");

    // ESCAPE ladder — blur the composer first (the handler skips input/textarea focus), then:
    //   1. first Escape returns from descent; the canvas un-dims and the scope SURVIVES.
    //   2. second Escape broadens back to the whole venture ("Direct the venture" restored).
    await client.evaluate(`document.activeElement && document.activeElement.blur && document.activeElement.blur()`);
    await pressEscape(client);
    await waitForDom(client, `!document.querySelector('[data-testid="stage-workspace"]')`, "first Escape did not return from descent");
    const afterFirstEscape = await client.evaluate(`(() => ({
      descended: Boolean(document.querySelector('[data-testid="stage-workspace"]')),
      dimmed: document.querySelector('.venture-canvas-stage')?.getAttribute('data-dimmed'),
      scoped: Boolean(document.querySelector('.venture-workspace-dock .now-composer-scope')),
    }))()`);
    assert.equal(afterFirstEscape.descended, false, "stage workspace stayed open after first Escape");
    assert.equal(afterFirstEscape.dimmed, "false", "canvas stayed dimmed after returning from descent");
    assert.equal(afterFirstEscape.scoped, true, "first Escape cleared the scope instead of only returning from descent");

    await pressEscape(client);
    await waitForDom(client, `document.querySelector('.venture-workspace-dock .now-composer textarea')?.getAttribute('placeholder') === 'Direct the venture'`, "second Escape did not broaden back to the whole venture");
    const afterSecondEscape = await client.evaluate(`Boolean(document.querySelector('.venture-workspace-dock .now-composer-scope'))`);
    assert.equal(afterSecondEscape, false, "second Escape left a scope in place");

    // GEOMETRY — the latent-overlap regressions the drover fixture cannot trigger are guarded
    // deterministically by canvasTerritory.test.ts (product-loop 480 no-overlap; two theory subjects ring
    // instead of stacking at the origin). Here, against the real built DOM, assert every rendered card is
    // clear (the overlaps[] check above already did this over ALL nodes) AND that if a wide product-loop or
    // a theory subject DOES render, it is separated from every neighbour by real geometry — so a fixture
    // that later grows architecture/theory can never silently overlap.
    const wide = await client.evaluate(`(() => {
      const nodes = [...document.querySelectorAll('.venture-workspace .react-flow__node')]
        .map((n) => {
          const el = n.querySelector('[data-kind]');
          const r = n.getBoundingClientRect();
          return { id: n.getAttribute('data-id'), kind: el?.getAttribute('data-kind') || null, w: r.width, left: r.left, top: r.top, right: r.right, bottom: r.bottom };
        })
        .filter((n) => n.w > 0);
      const loops = nodes.filter((n) => n.kind === 'product-loop');
      const theories = nodes.filter((n) => n.kind === 'theory');
      // Any product-loop the DOM renders is the real 480px card; confirm it is clear of everything.
      const loopOverlaps = [];
      for (const loop of loops) {
        for (const other of nodes) {
          if (other.id === loop.id) continue;
          if (loop.left < other.right && other.left < loop.right && loop.top < other.bottom && other.top < loop.bottom) loopOverlaps.push([loop.id, other.id]);
        }
      }
      return { loopCount: loops.length, loopWidths: loops.map((l) => Math.round(l.w)), theoryCount: theories.length, loopOverlaps };
    })()`);
    assert.deepEqual(wide.loopOverlaps, [], `product-loop card overlaps a neighbour: ${JSON.stringify(wide.loopOverlaps)}`);
    for (const width of wide.loopWidths) assert.ok(width >= 460, `product-loop rendered narrower than its 480px card (${width}px) — the seed footprint would under-reserve`);

    await assertNoUnhandledRejections(client);
  } finally {
    await chrome.close();
    await drover.close();
  }
});

test("?shell=canvas lens and answer are mutually exclusive and neither can leak into placement", async () => {
  const drover = await bootFixture(createCanvasVentureFixture);
  const chrome = await openCanvasVenture(drover);
  const { client } = chrome;
  try {
    // The three interplay guarantees the lens review named as must-fixes:
    //   (1) Law 6 — while an overlay (lens/answer) is active, nodes are NOT draggable, so a drag can never
    //       rewrite founder placement to the overlay's coordinates (React Flow drops the `draggable` class
    //       from a node wrapper it will not drag — the deterministic render tell).
    //   (2) entering a lens while an answer is open DISMISSES the answer and restores the exact free frame,
    //       then swallows that press (no lens entered from the answer's corrupted frame).
    //   (3) 'a' is inert while a lens is active (mutual exclusion in the other direction).
    await client.evaluate(`document.activeElement && document.activeElement.blur && document.activeElement.blur()`);
    const betId = await client.evaluate(`document.querySelector('.venture-workspace .react-flow__node[data-id^="bet:"]')?.getAttribute('data-id') || null`);
    assert.ok(betId, "no bet node to exercise the overlay guards");

    const isDraggable = () => client.evaluate(`document.querySelector('.react-flow__node[data-id=${JSON.stringify(betId)}]')?.classList.contains('draggable') === true`);

    // At rest the founder can drag their own layout: the node wrapper carries the draggable affordance.
    assert.equal(await isDraggable(), true, "a resting bet node was not draggable (founder can't arrange their layout)");

    // Enter a lens; the node LOSES its draggable affordance — a drag now cannot reach the placement commit.
    await pressLetter(client, "l");
    await client.evaluate("new Promise((r) => setTimeout(r, 520))");
    assert.equal(await isDraggable(), false, "a node stayed draggable inside a lens (Law 6: a drag could leak lens coords into placement)");

    // 'a' is inert while the lens is active (mutual exclusion): no generated answer opens.
    await pressLetter(client, "a");
    await client.evaluate("new Promise((r) => setTimeout(r, 120))");
    assert.equal(await client.evaluate(`!!document.querySelector('.generated-answer')`), false, "'a' opened a generated answer while a lens was active");

    // Escape back to free; dragging is restored.
    await pressEscape(client);
    await client.evaluate("new Promise((r) => setTimeout(r, 80))");
    assert.equal(await isDraggable(), true, "a node stayed locked after exiting the lens");

    // Now the OTHER direction: open an answer, capture the free frame, then press L. The answer must be
    // dismissed (restoring the exact frame) and NO lens active — the preempt swallowed that press.
    await fireNode(client, betId, "click");
    await waitForDom(client, `!!document.querySelector('.venture-workspace-dock .now-composer-scope')`, "click did not scope the composer");
    await client.evaluate(`document.activeElement && document.activeElement.blur && document.activeElement.blur()`);
    await client.evaluate("new Promise((r) => setTimeout(r, 60))");
    const freeFrame = await snapshotNodeFrame(client);
    const freeIds = Object.keys(freeFrame).sort();

    await pressLetter(client, "a");
    await waitForDom(client, `!!document.querySelector('.generated-answer')`, "pressing 'a' from free did not open a generated answer");
    await client.evaluate("new Promise((r) => setTimeout(r, 520))");

    await pressLetter(client, "l"); // lens key while the answer is open → preempt: dismiss, swallow entry
    await waitForDom(client, `!document.querySelector('.generated-answer')`, "pressing L did not dismiss the open answer (preempt)");
    await client.evaluate("new Promise((r) => setTimeout(r, 160))");
    const afterPreempt = await client.evaluate(`(() => ({
      lensActive: Boolean(document.querySelector('.lens-control .lens-word[data-active="true"]')),
      free: document.querySelector('.lens-word-free[data-active="true"]') ? true : false,
    }))()`);
    assert.equal(afterPreempt.lensActive, false, "a lens entered from the answer's frame instead of only dismissing it");
    assert.equal(afterPreempt.free, true, "after preempting the answer the surface was not in the free arrangement");
    const restored = await snapshotNodeFrame(client);
    assert.deepEqual(Object.keys(restored).sort(), freeIds, "preempting the answer changed the node id-set");
    for (const id of freeIds) {
      assert.deepEqual(restored[id], freeFrame[id], `node ${id} did not return to its exact pixel after answer-preempt`);
    }

    await assertNoUnhandledRejections(client);
  } finally {
    await chrome.close();
    await drover.close();
  }
});

test("?shell=canvas empty venture reads as named geography with first-direction affordances", async () => {
  const drover = await bootFixture(createEmptyCanvasVentureFixture);
  const chrome = await openCanvasVenture(drover);
  const { client } = chrome;
  try {
    // The empty plane names its geography (both territory kickers), retitles the intent hub to the venture
    // name, and the dock composer offers first directions — no lorem, no tutorial checklist (spec).
    const empty = await client.evaluate(`(() => {
      const kickers = [...document.querySelectorAll('.canvas-territory-kicker')].map((k) => k.getAttribute('data-territory'));
      const hub = document.querySelector('.react-flow__node[data-id="atlas:intent"] strong')?.textContent?.trim() || '';
      const bets = document.querySelectorAll('.venture-workspace .react-flow__node[data-id^="bet:"]').length;
      const chips = [...document.querySelectorAll('.venture-workspace-dock .now-chip')].map((c) => c.textContent.trim());
      const placeholder = document.querySelector('.venture-workspace-dock .now-composer textarea')?.getAttribute('placeholder');
      return { kickers, hub, bets, chips, placeholder };
    })()`);
    assert.ok(empty.kickers.includes("product") && empty.kickers.includes("gtm"), `empty canvas missing a territory kicker: ${JSON.stringify(empty.kickers)}`);
    assert.equal(empty.bets, 0, "empty venture rendered a bet card");
    assert.equal(empty.hub, drover.fixture.venture.name, "intent hub did not take the venture name on an empty venture");
    assert.ok(empty.chips.length >= 2, `empty dock composer offered no first-direction chips: ${JSON.stringify(empty.chips)}`);
    assert.equal(empty.placeholder, "Direct the venture", "empty dock composer lost its whole-venture placeholder");

    await assertNoUnhandledRejections(client);
  } finally {
    await chrome.close();
    await drover.close();
  }
});

test("?shell=canvas stays legible and honest when the connection goes offline", async () => {
  const drover = await bootFixture(createCanvasVentureFixture);
  const chrome = await openCanvasVenture(drover);
  const { client } = chrome;
  try {
    // Cut the network: the 1.2s lens poll fails and the connection phase drops to offline/stale. The
    // surface must NOT break — the cards stay on the plane, an honest freshness chip appears with a Retry,
    // and the dock composer is held with a stated reason (never a dead input, never data-as-live).
    const cardsBefore = await client.evaluate(`document.querySelectorAll('.venture-workspace .react-flow__node').length`);
    assert.ok(cardsBefore >= 4, "expected a populated canvas before going offline");
    await setNetworkOffline(client, true);
    await client.evaluate(`window.dispatchEvent(new Event('offline'))`);
    await waitForDom(
      client,
      `/Offline|Reconnecting/i.test(document.querySelector('.venture-workspace-freshness .firm-freshness')?.textContent || '')`,
      "offline/stale freshness chip never appeared on the canvas",
    );
    const offline = await client.evaluate(`(() => {
      const chip = document.querySelector('.venture-workspace-freshness .firm-freshness');
      return {
        chipText: (chip?.textContent || '').trim(),
        held: /consequential changes are held/i.test(chip?.textContent || ''),
        retry: Boolean([...(chip?.querySelectorAll('button') || [])].find((b) => /retry/i.test(b.textContent || ''))),
        cards: document.querySelectorAll('.venture-workspace .react-flow__node').length,
        canvasStillMounted: Boolean(document.querySelector('.venture-workspace .venture-canvas-flow.atlas-canvas')),
        composerDisabled: document.querySelector('.venture-workspace-dock .now-composer textarea')?.disabled === true,
        heldReason: (document.querySelector('.venture-workspace-dock .now-composer-held')?.textContent || '').trim(),
      };
    })()`);
    assert.ok(offline.canvasStillMounted, "the canvas plane unmounted when the connection dropped (broken screen)");
    assert.ok(offline.cards >= 4, "the last coherent cards disappeared when offline instead of holding");
    assert.ok(offline.held, `freshness chip did not state that consequential changes are held: ${JSON.stringify(offline.chipText)}`);
    assert.ok(offline.retry, "offline freshness chip offered no Retry");
    assert.equal(offline.composerDisabled, true, "dock composer was still writable while offline");
    assert.ok(offline.heldReason.length > 0, "held dock composer showed no reason (a dead input with no explanation)");

    await setNetworkOffline(client, false);
  } finally {
    await chrome.close();
    await drover.close();
  }
});

test("?shell=canvas holds a dense venture legible and keyboard-reachable via the outline", async () => {
  const drover = await bootFixture(createDenseVentureFixture);
  const chrome = await openCanvasVenture(drover);
  const { client } = chrome;
  try {
    // DENSE — many nodes still read: the placed cards do not overlap (collision-free by construction holds
    // at scale) and titles are legible (no zero-size or clipped-to-nothing cards).
    const dense = await client.evaluate(`(() => {
      const nodes = [...document.querySelectorAll('.venture-workspace .react-flow__node')]
        .map((n) => { const r = n.getBoundingClientRect(); return { id: n.getAttribute('data-id'), left: r.left, top: r.top, right: r.right, bottom: r.bottom, w: r.width, h: r.height }; })
        .filter((n) => n.w > 0 && n.h > 0);
      const overlaps = [];
      for (let i = 0; i < nodes.length; i += 1) {
        for (let j = i + 1; j < nodes.length; j += 1) {
          const a = nodes[i]; const b = nodes[j];
          if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) { overlaps.push([a.id, b.id]); }
        }
      }
      return { count: nodes.length, overlaps: overlaps.slice(0, 5), overlapCount: overlaps.length };
    })()`);
    assert.ok(dense.count >= 8, `dense canvas rendered too few cards to prove density: ${dense.count}`);
    assert.equal(dense.overlapCount, 0, `dense canvas cards overlap: ${JSON.stringify(dense.overlaps)}`);

    // KEYBOARD — every placed object is reachable through the deterministic outline. Press "o" (no
    // modifier), the outline opens as a role=listbox of role=option rows, the first row auto-focuses, and
    // arrow movement + Enter select without a pointer.
    await client.evaluate(`document.activeElement && document.activeElement.blur && document.activeElement.blur()`);
    await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "o", code: "KeyO", text: "o", windowsVirtualKeyCode: 79 });
    await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "o", code: "KeyO", windowsVirtualKeyCode: 79 });
    await waitForDom(client, `!!document.querySelector('#atlas-outline-panel [role="listbox"]')`, "the venture outline did not open on 'o'");
    const outline = await client.evaluate(`(() => {
      const listbox = document.querySelector('#atlas-outline-panel [role="listbox"]');
      const options = [...(listbox?.querySelectorAll('[role="option"]') || [])];
      const focusedIsOption = document.activeElement?.getAttribute('role') === 'option';
      return { options: options.length, focusedIsOption };
    })()`);
    assert.ok(outline.options >= 3, `outline exposed too few objects to be a real access path: ${outline.options}`);
    assert.equal(outline.focusedIsOption, true, "opening the outline did not move focus onto a reachable option");

    await assertNoUnhandledRejections(client);
  } finally {
    await chrome.close();
    await drover.close();
  }
});

test("?shell=canvas operating lens reorganizes then returns every node to its exact pre-toggle pixel", async () => {
  const drover = await bootFixture(createCanvasVentureFixture);
  const chrome = await openCanvasVenture(drover);
  const { client } = chrome;
  try {
    // The reversible covenant (spec §3): each lens ENTER → Escape returns every node to its exact free
    // pixel with an UNCHANGED id-set. Snapshot the free frame once, then for all four lenses press L
    // (enter/cycle) and Escape (exit) and re-assert the frame is byte-identical.
    await client.evaluate(`document.activeElement && document.activeElement.blur && document.activeElement.blur()`);
    // The altimeter + lens words are mounted (the new chrome on this surface).
    const control = await client.evaluate(`(() => ({
      words: [...document.querySelectorAll('.lens-control .lens-word')].map((w) => w.textContent.trim()),
      altimeter: Boolean(document.querySelector('.lens-altimeter .lens-altimeter-word')),
    }))()`);
    assert.deepEqual(control.words, ["Understand", "Design", "Execute", "Learn"], `lens words wrong: ${JSON.stringify(control.words)}`);
    assert.equal(control.altimeter, true, "the altimeter word did not mount");

    const freeFrame = await snapshotNodeFrame(client);
    const freeIds = Object.keys(freeFrame).sort();
    assert.ok(freeIds.length >= 4, `too few nodes to prove the covenant: ${freeIds.length}`);

    for (const lensName of ["Understand", "Design", "Execute", "Learn"]) {
      // Press L to enter/cycle to the next lens; the active word emphasizes and the altimeter gains a
      // one-word suffix. (Cycling forward from free lands on Understand, then advances each press.)
      await pressLetter(client, "l");
      await client.evaluate("new Promise((r) => setTimeout(r, 520))"); // let the ~400ms FLIP settle
      const active = await client.evaluate(`document.querySelector('.lens-control .lens-word[data-active="true"]')?.textContent?.trim() || null`);
      assert.ok(active, `no lens word emphasized after entering ${lensName}`);
      const suffix = await client.evaluate(`Boolean(document.querySelector('.lens-altimeter-suffix'))`);
      assert.equal(suffix, true, `altimeter gained no lens suffix under ${active}`);
      // A lens must NOT drop or duplicate any object: the id-set is unchanged while reorganized.
      const lensFrame = await snapshotNodeFrame(client);
      assert.deepEqual(Object.keys(lensFrame).sort(), freeIds, `lens ${active} changed the node id-set`);

      // Escape exits the lens; the FLIP restore is instant + pixel-exact.
      await pressEscape(client);
      await client.evaluate("new Promise((r) => setTimeout(r, 60))");
      const restored = await snapshotNodeFrame(client);
      assert.deepEqual(Object.keys(restored).sort(), freeIds, `Escape from ${active} changed the node id-set`);
      for (const id of freeIds) {
        assert.deepEqual(
          restored[id], freeFrame[id],
          `node ${id} did not return to its exact pixel after ${active} → Escape: ${JSON.stringify(restored[id])} vs ${JSON.stringify(freeFrame[id])}`,
        );
      }
      const freeAgain = await client.evaluate(`document.querySelector('.lens-word-free[data-active="true"]') ? true : false`);
      assert.equal(freeAgain, true, `Escape from ${active} did not return to the free arrangement`);
    }

    // A generated answer scopes the scene then dismisses back to the exact PRIOR frame (spec §4). Select a
    // bet, capture the exact frame just before asking, press "a" to ask, then Dismiss; the frame returns
    // pixel-exact with an unchanged id-set.
    const betId = await client.evaluate(`document.querySelector('.venture-workspace .react-flow__node[data-id^="bet:"]')?.getAttribute('data-id') || null`);
    assert.ok(betId, "no bet node to scope a generated answer");
    await fireNode(client, betId, "click");
    await waitForDom(client, `!!document.querySelector('.venture-workspace-dock .now-composer-scope')`, "click did not scope the composer");
    await client.evaluate(`document.activeElement && document.activeElement.blur && document.activeElement.blur()`);
    await client.evaluate("new Promise((r) => setTimeout(r, 60))");
    const priorFrame = await snapshotNodeFrame(client);
    const priorIds = Object.keys(priorFrame).sort();

    await pressLetter(client, "a");
    await waitForDom(client, `!!document.querySelector('.generated-answer')`, "pressing 'a' did not open a generated answer");
    await client.evaluate("new Promise((r) => setTimeout(r, 520))");
    const answerExits = await client.evaluate(`[...document.querySelectorAll('.generated-answer-exit')].map((b) => b.textContent.trim())`);
    assert.ok(answerExits.includes("Save as live view"), `generated answer missing the save-live-view exit: ${JSON.stringify(answerExits)}`);

    await client.evaluate(`document.querySelector('.generated-answer-dismiss')?.click()`);
    await waitForDom(client, `!document.querySelector('.generated-answer')`, "Dismiss did not close the generated answer");
    await client.evaluate("new Promise((r) => setTimeout(r, 160))");
    const afterDismiss = await snapshotNodeFrame(client);
    assert.deepEqual(Object.keys(afterDismiss).sort(), priorIds, "dismissing the generated answer changed the node id-set");
    for (const id of priorIds) {
      assert.deepEqual(afterDismiss[id], priorFrame[id], `node ${id} did not return to its exact pixel after answer → dismiss`);
    }

    await assertNoUnhandledRejections(client);
  } finally {
    await chrome.close();
    await drover.close();
  }
});
