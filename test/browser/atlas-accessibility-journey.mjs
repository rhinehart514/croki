#!/usr/bin/env node

// The retired VentureAtlas keyboard-accessibility surface these three tests drove (working-theory subject
// nodes with a `data-working-theory="true"` root attribute, `.atlas-dive`, the correction composer at
// `#firm-direction-composer`, `.firm-app-inspector .insp-inspect-work`) has NO live path in the workbench-first
// VentureWorkspace or its summoned map. Verified by source, not guessed:
//   - `data-working-theory` is set only by the retired `VentureAtlas.tsx` (grep: zero hits anywhere else);
//     VentureCanvasStage never sets it, so the WT6 CSS/DOM contract these tests assert against is inert.
//   - `theory:` subject nodes DO still render on the canvas (VentureCanvasStage.tsx resolves "theory:" ids
//     via targetTheory), reusing the same ArchitectureElement component as architecture nodes — but its
//     "Correct this" button calls `document.getElementById("firm-direction-composer")?.focus()`, and that
//     DOM id exists ONLY in the retired GoalComposer.tsx (`.firm-app-composer`), not in NowComposer/
//     `.venture-workspace-dock` — a dead no-op on the summoned map.
//   - `.atlas-dive` / DiveSurface is never imported by canvas/workspace/stage/now (StageWorkspace.tsx's own
//     header comment names it explicitly superseded); `.firm-app-inspector .insp-inspect-work` does not
//     exist outside the retired atlas/dive tree.
// So the WT6-specific assertions are dropped, not faked. Their real underlying concern — founder authority
// must be reachable without a mouse — is NOT yet covered anywhere else (canvas-journey.mjs never Tabs
// through the surface), so this file is replaced with ONE lean, workbench-first keyboard-accessibility test
// against the real wall fixture: Tab reaches the rail's Needs-you toggle and the specific release direction
// in native DOM order, Enter opens that direction's decision gate directly in the workbench, its two actions
// have visible keyboard focus and deterministic Tab order, and Escape returns to VentureHome without a map.

import assert from "node:assert/strict";
import { test } from "node:test";

import { createWallVentureFixture } from "../fixtures/firm-fixtures.mjs";
import { bootFixture, waitForDom } from "./fixtures/browser-harness.mjs";
import {
  assertAtlasAccessibility,
  assertVisibleKeyboardFocus,
  focusKeyboardTarget,
  focusedKeyboardTarget,
  openAtlasFixture,
  pressKeyboardKey,
} from "./fixtures/atlas-browser-harness.mjs";

test("venture workspace: founder authority is keyboard-reachable without a mouse, from the rail into a decision gate", async () => {
  const drover = await bootFixture(createWallVentureFixture);
  const chrome = await openAtlasFixture(drover, { width: 1920, height: 1080 });
  try {
    const { client } = chrome;
    const ventureId = drover.fixture.venture.id;
    await waitForDom(
      client,
      `fetch('/api/ventures/${ventureId}/wall').then((response) => response.json()).then((wall) => wall.queue.length === 4)`,
      "four-purpose wall fixture did not seed four durable decisions",
    );
    await waitForDom(client, `!!document.querySelector('.now-rail-needs-count')`, "needs-you count never appeared");

    // Tab reaches the rail's Needs-you toggle in native DOM order — this is real browser Tab order, not a
    // custom scene-graph walk (collectKeyboardTabOrder/focusedKeyboardTarget are generic document.
    // activeElement walkers; their sceneId reads .react-flow__node[data-id], which is unchanged).
    await client.evaluate(`document.activeElement?.blur?.()`);
    await client.evaluate(`document.body.focus({ preventScroll: true })`);
    // NOTE: the canvas ALSO renders a decorative "atlas:wall" hub node (FounderWall, reused from the
    // retired Atlas tree) whose accessible name also loosely matches /Needs you/ text ("Needs your hand").
    // That node's onOpenWall is wired to a no-op on the summoned map (atlasInertData) — a real but
    // out-of-scope vestigial control. Match the rail's OWN toggle by its class, not just its text, so this
    // test proves the real functioning control rather than tripping on the decorative one.
    const needsToggle = await focusKeyboardTarget(
      client,
      (target) => target.tag === "BUTTON" && target.className?.includes("now-rail-needs") && /Needs you/i.test(target.name),
      "the Needs you toggle was not reachable by keyboard",
    );
    assert.ok(needsToggle, "no keyboard target matched the Needs you toggle");
    await assertVisibleKeyboardFocus(client, "Needs you toggle");

    // Enter activates it (aria-pressed flips), filtering the rail.
    await pressKeyboardKey(client, "Enter");
    await waitForDom(client, `document.querySelector('.now-rail-needs')?.getAttribute('aria-pressed') === 'true'`, "Enter did not activate the Needs you toggle");

    // Tab onward to the release direction specifically. Its accessible name includes the founder-facing
    // sentence, so this does not depend on fixture update order or accept a different needs-you row.
    const railRow = await focusKeyboardTarget(
      client,
      (target) => target.className?.includes("now-rail-dir")
        && /Hold the exact private preview until the founder reviews it/i.test(target.name),
      "the release direction was not keyboard-reachable after the Needs you toggle",
    );
    assert.ok(railRow, "the release direction did not receive keyboard focus");
    await assertVisibleKeyboardFocus(client, "release direction row");
    await pressKeyboardKey(client, "Enter");
    await waitForDom(
      client,
      `!!document.querySelector('.venture-workspace[data-mode="work"] [data-testid="venture-workbench"][data-mode="work"] .now-gate')`,
      "Enter on the release direction did not open its decision gate in the workbench",
    );

    // The RELEASE-purpose gate has exactly two always-enabled actions — "Approve & send" and "Reject" —
    // unlike answer/end-bet gates whose second control can depend on entered text.

    // The decision gate's buttons are keyboard-focusable with a visible focus treatment and Tab-orderable.
    await client.evaluate(`document.activeElement?.blur?.()`);
    const firstGateButton = await focusKeyboardTarget(
      client,
      (target) => target.className?.includes("now-gate-btn"),
      "no decision gate button was keyboard-reachable",
    );
    assert.ok(firstGateButton, "no gate button focused");
    await assertVisibleKeyboardFocus(client, "decision gate button");
    const secondGateButton = await focusKeyboardTarget(
      client,
      (target) => target.className?.includes("now-gate-btn") && target.name !== firstGateButton.name,
      "only one decision gate button was keyboard-reachable (buttons are not Tab-orderable)",
    );
    assert.ok(secondGateButton, "no second distinct gate button focused");

    // Escape clears the selected work and returns to VentureHome. The map remains absent at rest.
    await client.evaluate(`document.activeElement?.blur?.()`);
    await pressKeyboardKey(client, "Escape");
    await waitForDom(
      client,
      `!!document.querySelector('.venture-workspace[data-mode="work"] [data-testid="venture-workbench"] .vh') && !document.querySelector('[data-testid="stage-workspace"]')`,
      "Escape did not return from the release decision to VentureHome",
    );
    const restingSurface = await client.evaluate(`(() => ({
      home: Boolean(document.querySelector('.venture-workspace[data-mode="work"] [data-testid="venture-workbench"] .vh')),
      map: Boolean(document.querySelector('.venture-workspace .venture-canvas-flow.atlas-canvas')),
    }))()`);
    assert.equal(restingSurface.home, true, "VentureHome was not restored after Escape");
    assert.equal(restingSurface.map, false, "Escape returned to the map instead of VentureHome");

    await assertAtlasAccessibility(client);
  } finally {
    await chrome.close();
    await drover.close();
  }
});
