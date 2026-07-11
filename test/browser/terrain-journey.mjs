#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { launchChrome } from "./lib/cdp.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const SAMPLE = path.join(ROOT, "samples/acme-saas");
const FIXTURE_DIR = path.join(ROOT, "brain/test/fixtures/terrain");
const TERRAIN_VIEW = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, "terrain-view.json"), "utf8"));
const READ_CASES = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, "terrain-read-cases.json"), "utf8"));
const THREE_HYPOTHESES = ["valid-derived-opening", "speculative-opening", "tension-with-counterevidence"]
  .flatMap((id) => READ_CASES.cases.find((item) => item.id === id).response.hypotheses)
  .map((hypothesis, index) => ({ ...hypothesis, id: hypothesis.id ?? `fixture-hypothesis-${index + 1}` }));
const CHANGED_READ_CASE = READ_CASES.cases.find((item) => item.id === "outcome-changed-read").response;
const CHANGED_READ = {
  ...CHANGED_READ_CASE,
  // The changed read revises the selected terrain object; it is not an anonymous replacement. Production
  // reads always pass through the host normalizer, so the browser fixture must not emit an undefined ref.
  hypotheses: CHANGED_READ_CASE.hypotheses.map((hypothesis, index) => ({
    ...hypothesis,
    id: index === 0 ? THREE_HYPOTHESES[0].id : `fixture-changed-hypothesis-${index + 1}`,
  })),
};

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "compact", width: 1024, height: 768 },
  { name: "narrow", width: 390, height: 844, mobile: true },
];

const PIPELINE_ID = "fixture-terrain-pipeline";
// Large enough to force the production canvas's visible-element virtualization path. These are durable
// fixture goals created through the real API, not client-seeded cards or claimed user activity.
const DENSE_GOAL_COUNT = 144;
const FIXTURE_GRAPH = {
  id: PIPELINE_ID,
  name: "Project brief activation test",
  version: "1",
  revision: 1,
  nodes: [
    { id: "source", category: "source", connector: "manual", label: "Brief recipients", position: { x: 40, y: 180 }, config: { items: [{ id: "recipient-1", name: "Fixture recipient" }] } },
    { id: "draft", kind: "agent", ref: "product-strategist", label: "Shape the recipient follow-through", position: { x: 330, y: 180 }, contract: { accepts: [], emits: [], minItems: 0 } },
    { id: "gate", category: "gate", connector: "default", label: "Founder review", position: { x: 620, y: 180 } },
    { id: "execute", category: "execute", connector: "local", label: "Stage locally", position: { x: 910, y: 180 } },
    { id: "measure", category: "measure", connector: "default", label: "Observe response", position: { x: 1200, y: 180 } },
  ],
  edges: [
    { id: "source-draft", source: "source", target: "draft", edgeType: "data" },
    { id: "draft-gate", source: "draft", target: "gate", edgeType: "data" },
    { id: "gate-execute", source: "gate", target: "execute", edgeType: "data" },
    { id: "execute-measure", source: "execute", target: "measure", edgeType: "data" },
  ],
  workContext: {
    terrainRef: { type: "terrain-hypothesis", id: THREE_HYPOTHESES[0].id },
    intendedEffect: THREE_HYPOTHESES[0].suggestedMove?.intendedEffect,
    measurementIntent: THREE_HYPOTHESES[0].suggestedMove?.measurementIntent,
  },
};

const GATE_ITEM = {
  id: "fixture-draft-1",
  type: "draft",
  subject: "Invite the brief recipient into one reversible next step",
  draft: "Your project brief is ready. Open it and continue into a workspace if the context is useful.",
  joinKey: "fixture-join-1",
  gtmActionId: "fixture-action-1",
  whatYourYesDoes: "Approving stages this fixture action locally; nothing reaches an external recipient.",
};

function fixtureRun({ approved = false } = {}) {
  const gateItem = approved
    ? { ...GATE_ITEM, gated: true, approved: true, approvalStatus: "approved" }
    : GATE_ITEM;
  return {
    runId: "fixture-run-1",
    graphId: PIPELINE_ID,
    ok: approved,
    nodes: {
      source: { ok: true, items: [{ id: "recipient-1", name: "Fixture recipient" }] },
      draft: { ok: true, items: [GATE_ITEM] },
      gate: { ok: true, items: [gateItem], pendingReview: !approved, meta: { awaitingReview: approved ? 0 : 1, approved: approved ? 1 : 0 } },
      execute: approved ? { ok: true, items: [gateItem] } : { ok: false, blocked: true, items: [] },
      measure: approved ? { ok: true, items: [] } : { ok: false, blocked: true, items: [] },
    },
    executionOrder: ["source", "draft", "gate", ...(approved ? ["execute", "measure"] : [])],
    pendingGates: approved ? [] : ["gate"],
    feedbackEdges: [],
  };
}

function fixturePartialFailureRun() {
  return {
    runId: "fixture-partial-failure-run",
    graphId: PIPELINE_ID,
    ok: false,
    error: "The drafting step stopped. The completed recipient lookup is still available.",
    nodes: {
      source: {
        ok: true,
        category: "source",
        items: [{ id: "recipient-1", name: "Fixture recipient" }],
      },
      draft: {
        ok: false,
        items: [],
        error: "Fixture drafting runtime stopped before producing copy.",
      },
      gate: { ok: false, blocked: true, items: [] },
      execute: { ok: false, blocked: true, items: [] },
      measure: { ok: false, blocked: true, items: [] },
    },
    executionOrder: ["source", "draft"],
    pendingGates: [],
    feedbackEdges: [],
  };
}

function fixtureSession(projectId) {
  const at = "2026-07-10T12:03:00.000Z";
  return {
    id: "fixture-operator-session",
    kind: "goal",
    goal: "Turn the project brief terrain opening into a measured move.",
    projectId,
    graphId: PIPELINE_ID,
    graphRevision: 1,
    surface: "terrain",
    lens: "operator",
    focusRef: `terrain-hypothesis:${THREE_HYPOTHESES[0].id}`,
    contextRefs: [],
    participantRefs: ["product-strategist", "market-skeptic"],
    productRefs: ["sample-acme"],
    status: "completed",
    model: "fixture",
    runtime: "fixture",
    createdAt: at,
    updatedAt: at,
    startedAt: at,
    completedAt: at,
    stepCount: 1,
    maxSteps: 18,
    spentUsd: 0,
    runtimeSessionId: "fixture-runtime-session",
    summary: "Built the selected terrain move as an open pipeline.",
    error: null,
    pendingQuestion: null,
    pendingGate: null,
    pendingProposal: null,
    events: [],
  };
}

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function freePort() {
  const server = net.createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitFor(url, child, label) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (child?.exitCode !== null) throw new Error(`${label} exited before it became ready.`);
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch {
      // Process is still starting.
    }
    await delay(50);
  }
  throw new Error(`${label} did not become ready at ${url}.`);
}

function scrubbedEnvironment(home, port) {
  const env = { ...process.env, GTM_IDE_HOME: home, GTM_IDE_PERSISTENCE: "json", GTM_IDE_OPERATOR_RUNTIME: "none", GTM_IDE_DISABLE_CLAUDE_CODE: "1", GTM_IDE_FOUNDER_CODE: "terrain-fixture-founder", HOST: "127.0.0.1", PORT: String(port) };
  for (const key of ["ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN", "OPENAI_API_KEY", "CODEX_API_KEY"]) delete env[key];
  return env;
}

async function bootDrover() {
  const port = await freePort();
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "drover-terrain-browser-store-"));
  const child = spawn(process.execPath, ["brain/src/server.mjs"], {
    cwd: ROOT,
    env: scrubbedEnvironment(home, port),
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  const base = `http://127.0.0.1:${port}`;
  try {
    await waitFor(`${base}/api/health`, child, "Drover");
    const created = await fetch(`${base}/api/projects`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Acme terrain fixture", repoPath: SAMPLE, winEvent: "signup_completed" }),
    });
    if (!created.ok) assert.fail(`sample grounding failed: ${await created.text()}`);
    const body = await created.json();
    const seededGoals = await Promise.all(Array.from({ length: DENSE_GOAL_COUNT }, (_, index) => fetch(`${base}/api/projects/${body.activeProjectId}/goals`, {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": `fixture:dense-goal:${index + 1}` },
      body: JSON.stringify({
        statement: `Fixture goal ${String(index + 1).padStart(2, "0")}`,
        desiredChange: `Keep independent workstream ${index + 1} addressable without a primary mission.`,
        createdBy: "fixture-founder",
        idempotencyKey: `fixture:dense-goal:${index + 1}`,
      }),
    })));
    const seededGoalResults = await Promise.all(seededGoals.map(async (response) => ({ ok: response.ok, body: await response.text() })));
    const failedGoal = seededGoalResults.find((response) => !response.ok);
    if (failedGoal) assert.fail(`dense goal grounding failed: ${failedGoal.body}`);
    return {
      base,
      child,
      home,
      output: () => output,
      projectId: body.activeProjectId,
      async close() {
        child.kill("SIGTERM");
        await Promise.race([once(child, "exit"), delay(2000).then(() => child.kill("SIGKILL"))]);
        fs.rmSync(home, { recursive: true, force: true });
      },
    };
  } catch (error) {
    child.kill("SIGTERM");
    await Promise.race([once(child, "exit"), delay(2000).then(() => child.kill("SIGKILL"))]);
    fs.rmSync(home, { recursive: true, force: true });
    throw error;
  }
}

async function proxyResponse(upstream, request, response) {
  const target = new URL(request.url, upstream);
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const upstreamResponse = await fetch(target, {
    method: request.method,
    headers: request.headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : Buffer.concat(chunks),
    redirect: "manual",
  });
  if (process.env.TERRAIN_DEBUG === "1" && !upstreamResponse.ok) {
    console.error(`Gate B upstream ${request.method} ${target.pathname}${target.search} -> ${upstreamResponse.status}`);
  }
  const headers = Object.fromEntries(upstreamResponse.headers.entries());
  response.writeHead(upstreamResponse.status, headers);
  response.end(Buffer.from(await upstreamResponse.arrayBuffer()));
}

async function bootFixtureProxy(drover, { runtimeConnected = true } = {}) {
  const port = await freePort();
  let pipelineCreated = false;
  let runStarted = false;
  let gateApproved = false;
  let resultRecorded = false;
  let partialFailureNext = false;
  let partialFailureActive = false;
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, `http://127.0.0.1:${port}`);
    if (process.env.TERRAIN_DEBUG === "1" && /terrain|operator\/sessions|graph\/(run|template)|outcome/.test(url.pathname)) {
      console.log(`Gate B fixture ${request.method} ${url.pathname}${url.search}`);
    }
    const send = (status, body) => {
      response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
      response.end(JSON.stringify(body));
    };
    try {
      if (request.method === "GET" && url.pathname === "/api/connection") {
        send(200, runtimeConnected
          ? { connected: true, label: "Fixture runtime", reason: null, selectedRuntime: "fixture", runtimes: [{ id: "fixture", available: true }] }
          : { connected: false, label: null, reason: "No local runtime is connected.", selectedRuntime: null, runtimes: [] });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/product-model/derive") {
        send(200, {
          productModel: {
            id: "fixture-product-model",
            projectId: drover.projectId,
            version: 1,
            things: [{ id: "thing-project-brief", name: "Project brief", kind: "artifact", summary: "A signed read-only brief shared outside a workspace." }],
            relationships: [],
            userGoals: [{ id: "goal-share-context", actor: "Workspace owner", goal: "Share project context", outcome: "A recipient understands the work without joining first." }],
            states: [], ia: [], workflows: [], interactions: [], transitions: [], pinnedSignals: [],
          },
          meta: { provider: "fixture" },
        });
        return;
      }
      if (request.method === "GET" && url.pathname === `/api/projects/${drover.projectId}/terrain`) {
        send(200, {
          ...TERRAIN_VIEW,
          projectId: drover.projectId,
          state: { ...TERRAIN_VIEW.state, stale: resultRecorded },
          product: { ...TERRAIN_VIEW.product, projectRef: { type: "product", id: drover.projectId } },
          outcomes: resultRecorded ? [{ type: "outcome", id: "outcome-brief-zero-conversion" }] : [],
        });
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/operating-view") {
        const actual = await fetch(new URL(request.url, drover.base), { headers: request.headers });
        const actualBody = actual.ok ? await actual.json() : {};
        const canvas = actualBody?.woven?.canvas ?? { anchors: [], relationships: [], outcomes: [], implications: [], geometry: TERRAIN_VIEW.geometry };
        const outcome = {
          id: "outcome-brief-zero-conversion",
          ref: { type: "outcome", id: "outcome-brief-zero-conversion" },
          kind: "observed-response",
          label: "No response from the project brief",
          value: 0,
          observedAt: "2026-07-10T12:08:00.000Z",
          channelId: PIPELINE_ID,
          questionId: null,
          productRefs: [drover.projectId],
          crewRefs: ["product-strategist", "market-skeptic"],
          runId: "fixture-run-1",
        };
        send(200, {
          ...actualBody,
          projectId: drover.projectId,
          woven: {
            ...(actualBody.woven ?? {}),
            projectId: drover.projectId,
            canvas: {
              ...canvas,
              outcomes: resultRecorded ? [outcome] : [],
              anchors: resultRecorded ? [
                ...(canvas.anchors ?? []).filter((anchor) => anchor.ref?.id !== outcome.id),
                { id: `anchor:outcome:${outcome.id}`, ref: outcome.ref, kind: "outcome", label: outcome.label, body: outcome, authority: { owner: "fixture", id: outcome.id, projectId: drover.projectId, updatedAt: outcome.observedAt } },
              ] : (canvas.anchors ?? []),
            },
          },
        });
        return;
      }
      if (url.pathname === `/api/projects/${drover.projectId}/terrain/read` && request.method === "POST") {
        send(200, {
          schemaVersion: 1,
          id: "fixture-read-1",
          projectId: drover.projectId,
          generatedAt: "2026-07-10T12:01:00.000Z",
          inputFingerprint: resultRecorded ? "fixture:sample-acme:joined-outcome-v2" : READ_CASES.inputFingerprint,
          runtime: READ_CASES.runtime,
          hypotheses: resultRecorded ? CHANGED_READ.hypotheses : THREE_HYPOTHESES,
        });
        return;
      }
      if (url.pathname === `/api/projects/${drover.projectId}/terrain/crew` && request.method === "POST") {
        send(200, {
          schemaVersion: 1,
          projectId: drover.projectId,
          hypothesisRef: { type: "terrain-hypothesis", id: THREE_HYPOTHESES[0].id },
          generatedAt: "2026-07-10T12:02:00.000Z",
          runtime: READ_CASES.runtime,
          positions: READ_CASES.disagreement.positions.map((position, index) => ({
            id: `fixture-position-${index + 1}`,
            participantRef: position.teammateRef.id,
            claim: position.position,
            uncertainty: position.uncertainty,
            recommendation: position.recommendation,
            falsifier: position.falsifier,
            evidenceRefs: position.evidenceRefs,
            disagreesWith: [READ_CASES.disagreement.positions[index === 0 ? 1 : 0].teammateRef.id],
          })),
        });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/operator/sessions") {
        pipelineCreated = true;
        send(202, { session: fixtureSession(drover.projectId), reused: false });
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/operator/sessions/fixture-operator-session") {
        send(200, { session: fixtureSession(drover.projectId) });
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/graph/template" && url.searchParams.get("channel") === PIPELINE_ID) {
        const latestRun = partialFailureActive
          ? fixturePartialFailureRun()
          : fixtureRun({ approved: gateApproved });
        send(200, { graph: FIXTURE_GRAPH, runs: runStarted ? [latestRun] : [] });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/graph/audit") {
        send(200, { audits: {} });
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/project" && pipelineCreated) {
        const actual = await fetch(new URL(request.url, drover.base), { headers: request.headers });
        const body = await actual.json();
        send(200, {
          ...body,
          project: {
            ...body.project,
            activeChannelId: null,
            channels: [{
              id: PIPELINE_ID,
              graphId: PIPELINE_ID,
              name: "Project brief activation test",
              objective: "Test whether the read-only project brief becomes a product-led entry point.",
              kind: "terrain-selected-move",
              enabled: true,
              status: partialFailureActive ? "failed" : gateApproved ? "done" : runStarted ? "waiting" : "idle",
              lastRunAt: runStarted ? "2026-07-10T12:05:00.000Z" : null,
              lastRunOk: gateApproved,
              pendingGates: runStarted && !gateApproved && !partialFailureActive ? 1 : 0,
              nodeCount: FIXTURE_GRAPH.nodes.length,
              runCount: runStarted ? 1 : 0,
              graphRevision: 1,
              workContext: FIXTURE_GRAPH.workContext,
            }],
          },
        });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/graph/run/stream") {
        runStarted = true;
        partialFailureActive = partialFailureNext;
        partialFailureNext = false;
        const result = partialFailureActive ? fixturePartialFailureRun() : fixtureRun();
        response.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store" });
        const streamedNodeIds = partialFailureActive ? ["source", "draft"] : ["source", "draft", "gate"];
        const events = [
          { type: "run_start", nodeIds: FIXTURE_GRAPH.nodes.map((node) => node.id) },
          ...streamedNodeIds.flatMap((nodeId) => [{ type: "node_start", nodeId }, { type: "node_done", nodeId, result: result.nodes[nodeId] }]),
          { type: "run_done", result },
        ];
        response.end(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""));
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/graph/run") {
        gateApproved = true;
        send(200, fixtureRun({ approved: true }));
        return;
      }
      if (request.method === "GET" && url.pathname === `/api/projects/${drover.projectId}/run-summary`) {
        send(200, { run: runStarted ? { runId: "fixture-run-1", staged: 1, sent: gateApproved ? 1 : 0, measured: resultRecorded ? 1 : 0, replies: 0, calls: 0, signups: 0, paid: 0, noReply: resultRecorded ? 1 : null, revenue: null, note: resultRecorded ? "The brief drew no response." : "Awaiting a market result." } : null });
        return;
      }
      if (request.method === "POST" && url.pathname === `/api/projects/${drover.projectId}/outcome`) {
        resultRecorded = true;
        send(201, { ok: true, id: "outcome-brief-zero-conversion", joined: true, kind: "negative", stale: true });
        return;
      }
      await proxyResponse(drover.base, request, response);
    } catch (error) {
      send(502, { error: error instanceof Error ? error.message : String(error) });
    }
  });
  server.listen(port, "127.0.0.1");
  await once(server, "listening");
  return {
    base: `http://127.0.0.1:${port}`,
    reset() {
      pipelineCreated = false;
      runStarted = false;
      gateApproved = false;
      resultRecorded = false;
      partialFailureNext = false;
      partialFailureActive = false;
    },
    failNextRun() { partialFailureNext = true; },
    close: () => new Promise((resolve) => {
      server.closeAllConnections?.();
      server.close(resolve);
    }),
  };
}

function browserHelpers() {
  return `
    (() => {
      const visible = (element) => {
        if (!element) return false;
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
      };
      const byTestId = (id) => document.querySelector('[data-testid="' + id + '"]');
      const byText = (text) => [...document.querySelectorAll('button,[role="button"],a,h1,h2,h3,[role="heading"]')]
        .find((element) => visible(element) && (element.textContent || "").trim().toLowerCase().includes(text.toLowerCase()));
      window.__terrainEval = { visible, byTestId, byText };
      return true;
    })()
  `;
}

async function waitForDom(client, expression, reason, timeout = 8000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await client.evaluate(expression).catch(() => false)) return;
    await delay(100);
  }
  throw new Error(reason);
}

async function activate(client, testId, text, reason, keyboardOnly) {
  let focusedOrClicked = false;
  const started = Date.now();
  // ReactFlow may remount a node while its measured size settles. Find and activate in one browser task,
  // retrying across that transition so the evaluator grades the stable control rather than one animation
  // frame. A control that never becomes actionable still fails with the caller's exact journey reason.
  while (!focusedOrClicked && Date.now() - started < 8000) {
    focusedOrClicked = await client.evaluate(`(() => {
      const element = window.__terrainEval.byTestId(${JSON.stringify(testId)}) || window.__terrainEval.byText(${JSON.stringify(text)});
      if (!window.__terrainEval.visible(element)) return false;
      if (${keyboardOnly ? "true" : "false"}) element.focus();
      else element.click();
      return true;
    })()`).catch(() => false);
    if (!focusedOrClicked) await delay(100);
  }
  assert.equal(focusedOrClicked, true, reason);
  if (keyboardOnly) {
    await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter" });
    await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter" });
  }
}

async function fillLabeledControl(client, labelText, value, reason) {
  const changed = await client.evaluate(`(() => {
    const label = [...document.querySelectorAll('label')].find((candidate) =>
      window.__terrainEval.visible(candidate) && (candidate.textContent || '').toLowerCase().includes(${JSON.stringify(labelText.toLowerCase())}));
    const control = label?.querySelector('input,textarea');
    if (!control) return false;
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(control), 'value')?.set;
    if (!setter) return false;
    setter.call(control, ${JSON.stringify(value)});
    control.dispatchEvent(new Event('input', { bubbles: true }));
    control.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  assert.equal(changed, true, reason);
}

async function assertOpenCanvasGoal(client, viewport, keyboardOnly) {
  const suffix = `${viewport.name}${keyboardOnly ? " keyboard" : ""}`;
  const statement = `Keep ${suffix} canvas work visible`;
  const closedFocus = await client.evaluate(`(() => {
    const control = document.querySelector('[aria-label="Close terrain focus"]');
    if (!control) return true;
    if (${keyboardOnly ? "true" : "false"}) control.focus();
    else control.click();
    return true;
  })()`);
  assert.equal(closedFocus, true, `${suffix}: the terrain focus could not yield back to the shared canvas`);
  if (keyboardOnly && await client.evaluate(`document.activeElement?.getAttribute('aria-label') === 'Close terrain focus'`)) {
    await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter" });
    await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter" });
  }
  await waitForDom(client, `!!document.querySelector('[aria-label="Add canvas work"]')`, `${suffix}: the open-canvas launcher did not appear`);
  const denseReceipt = await client.evaluate(`(() => {
    const flow = document.querySelector('.react-flow');
    return {
      projected: Number(flow?.getAttribute('data-canvas-node-count') || 0),
      edges: Number(flow?.getAttribute('data-canvas-edge-count') || 0),
      virtualized: flow?.getAttribute('data-canvas-virtualized'),
      renderedGoals: document.querySelectorAll('[data-ref^="goal:"]').length,
    };
  })()`);
  assert.ok(denseReceipt.projected >= DENSE_GOAL_COUNT, `${suffix}: ${DENSE_GOAL_COUNT} durable fixture goals did not remain in the complete canvas projection (${denseReceipt.projected})`);
  assert.equal(denseReceipt.virtualized, "true", `${suffix}: the dense canvas did not enable off-screen node/edge virtualization`);
  assert.ok(denseReceipt.renderedGoals > 0 && denseReceipt.renderedGoals < DENSE_GOAL_COUNT,
    `${suffix}: visible-element virtualization did not bound dense goal DOM (${denseReceipt.renderedGoals}/${DENSE_GOAL_COUNT})`);
  await activate(client, "", "New goal", `${suffix}: the canvas could not start an independent goal`, keyboardOnly);
  await waitForDom(client, `!!document.querySelector('aside[aria-label="Canvas workbench"]')`, `${suffix}: the goal workbench did not open`);
  await fillLabeledControl(client, "What do you want to change?", statement, `${suffix}: the goal statement was not editable`);
  await fillLabeledControl(client, "What would be different?", "The goal survives as an addressable canvas object.", `${suffix}: the desired change was not editable`);
  await activate(client, "", "Place on canvas", `${suffix}: the goal could not be placed on the canvas`, keyboardOnly);
  await waitForDom(client, `(() => [...document.querySelectorAll('[data-ref^="goal:"]')].some((element) => (element.textContent || '').includes(${JSON.stringify(statement)})))()`, `${suffix}: the saved goal did not materialize on the canvas`);
  const goalBounds = await client.evaluate(`(() => { const element = [...document.querySelectorAll('[data-ref^="goal:"]')].find((candidate) => (candidate.textContent || '').includes(${JSON.stringify(statement)})); const rect = element?.getBoundingClientRect(); return rect ? [rect.left, rect.top, rect.right, rect.bottom] : null; })()`);
  assert.ok(goalBounds && goalBounds[0] >= 0 && goalBounds[1] >= 0 && goalBounds[2] <= viewport.width && goalBounds[3] <= viewport.height,
    `${suffix}: the newly placed goal was not focused into the visible canvas (${goalBounds?.join("/") ?? "missing"})`);

  const closeWorkbench = await client.evaluate(`(() => {
    const control = document.querySelector('[aria-label="Close canvas workbench"]');
    if (!control) return false;
    if (${keyboardOnly ? "true" : "false"}) control.focus();
    else control.click();
    return true;
  })()`);
  assert.equal(closeWorkbench, true, `${suffix}: the created goal inspector could not return to the canvas`);
  if (keyboardOnly) {
    await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter" });
    await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter" });
  }
  await waitForDom(client, `!!document.querySelector('[aria-label="Add canvas work"]')`, `${suffix}: the canvas launcher did not return after inspection`);
  await activate(client, "", "Open work", `${suffix}: saved canvas work could not be reopened`, keyboardOnly);
  const offscreenFixtureGoal = `Fixture goal ${String(DENSE_GOAL_COUNT).padStart(3, "0")}`;
  await fillLabeledControl(client, "Find work", offscreenFixtureGoal, `${suffix}: dense off-screen canvas work could not be searched`);
  await waitForDom(client, `(() => [...document.querySelectorAll('.open-canvas-browser-results button')].some((element) => (element.textContent || '').includes(${JSON.stringify(offscreenFixtureGoal)})))()`, `${suffix}: dense search did not resolve an addressable goal outside the bounded canvas DOM`);
  await fillLabeledControl(client, "Find work", statement, `${suffix}: saved canvas work could not be searched`);
  await waitForDom(client, `(() => [...document.querySelectorAll('.open-canvas-browser-results button')].some((element) => (element.textContent || '').includes(${JSON.stringify(statement)})))()`, `${suffix}: the saved goal did not appear in canvas search`);
}

async function assertAccessibility(client, viewport) {
  const failures = await client.evaluate(`(() => {
    const interactive = [...document.querySelectorAll('button,a[href],input,select,textarea,[role="button"]')]
      .filter(window.__terrainEval.visible);
    const name = (element) => element.getAttribute('aria-label') || element.getAttribute('title') ||
      (element.getAttribute('aria-labelledby') ? document.getElementById(element.getAttribute('aria-labelledby'))?.textContent : '') ||
      element.textContent || element.getAttribute('placeholder') || element.getAttribute('name') || '';
    return interactive.filter((element) => !name(element).trim()).map((element) => element.outerHTML.slice(0, 180));
  })()`);
  assert.deepEqual(failures, [], `${viewport.name}: visible controls without accessible labels: ${failures.join(" | ")}`);

  const clipped = await client.evaluate(`(() => [...document.querySelectorAll('[data-terrain-primary="true"],[data-testid="terrain-primary-action"],[data-testid="founder-gate-approve"]')]
    .filter(window.__terrainEval.visible)
    .filter((element) => { const r = element.getBoundingClientRect(); return r.left < 0 || r.top < 0 || r.right > innerWidth || r.bottom > innerHeight; })
    .map((element) => { const r = element.getBoundingClientRect(); return { id: element.getAttribute('data-testid') || element.textContent?.trim() || element.tagName, rect: [r.left, r.top, r.right, r.bottom], viewport: [innerWidth, innerHeight] }; }))()`);
  if (process.env.TERRAIN_DEBUG === "1" && viewport.name === "narrow") {
    console.log("narrow layout", await client.evaluate(`(() => [...document.querySelectorAll('.fdock,.fdock-left,.fdock-right,.project-switcher-trigger,.osw-trigger,.tfocus,.tfocus-actions')].map((element) => { const r = element.getBoundingClientRect(); return { className: element.className, rect: [r.left, r.top, r.right, r.bottom], display: getComputedStyle(element).display, width: getComputedStyle(element).width }; }))()`));
  }
  assert.deepEqual(clipped, [], `${viewport.name}: clipped primary controls: ${clipped.map((item) => `${item.id} @ ${item.rect.join("/")} in ${item.viewport.join("x")}`).join(", ")}`);
}

async function runJourney(client, viewport, { keyboardOnly = false } = {}) {
  await client.send("Emulation.setDeviceMetricsOverride", { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: viewport.mobile === true });
  await client.evaluate("localStorage.clear()").catch(() => {});
  await client.send("Page.reload", { ignoreCache: true });
  await waitForDom(client, "document.readyState === 'complete' && !!document.querySelector('#root')", `${viewport.name}: Drover did not finish loading`);
  const founderSession = await client.evaluate(`fetch('/api/founder-session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: 'terrain-fixture-founder' }) }).then((response) => response.status)`);
  assert.equal(founderSession, 200, `${viewport.name}: browser fixture could not establish the founder action session`);
  await client.evaluate(browserHelpers());

  await waitForDom(
    client,
    `!!window.__terrainEval.byTestId("terrain-product-landmark")`,
    `${viewport.name}: Gate B step 2 failed — a grounded zero-pipeline product did not render the cited terrain landmark before a goal field. Lane B/C terrain projection and first-screen routing are not merged.`,
  );
  const goalRequired = await client.evaluate(`(() => { const goal = document.querySelector('[data-testid="goal-launcher"], input[required][name*="goal" i], textarea[required][name*="goal" i]'); return window.__terrainEval.visible(goal); })()`);
  assert.equal(goalRequired, false, `${viewport.name}: Gate B step 2 failed — a goal is required before deterministic product truth is useful`);

  await waitForDom(client, `document.querySelectorAll('[data-testid="terrain-hypothesis"]').length === 3`, `${viewport.name}: Gate B step 3 failed — three fixture hypotheses did not arrive progressively`);
  const progressiveCounts = await client.evaluate("window.__droverTerrainCounts || []");
  assert.deepEqual(progressiveCounts.slice(-3), [1, 2, 3], `${viewport.name}: Gate B step 3 rendered a batch reveal instead of progressive terrain (${progressiveCounts.join(", ")})`);
  await activate(client, "terrain-hypothesis", "Make the project brief", `${viewport.name}: Gate B step 4 could not focus a hypothesis`, keyboardOnly);
  await waitForDom(client, `(() => { const panel = window.__terrainEval.byTestId("terrain-hypothesis-detail"); return panel && /evidence/i.test(panel.textContent) && /falsifier|change the read/i.test(panel.textContent); })()`, `${viewport.name}: Gate B step 4 failed — focused terrain did not expose evidence and falsifier`);

  if (keyboardOnly) {
    await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab" });
    await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab" });
    const focused = await client.evaluate(`document.activeElement !== document.body && !!document.activeElement`);
    assert.equal(focused, true, "keyboard-only: Tab did not reach a visible canvas control");
  }
  await activate(client, "terrain-ask-crew", "Ask crew", `${viewport.name}: Gate B step 5 could not ask the crew`, keyboardOnly);
  await waitForDom(client, `document.querySelectorAll('[data-testid="crew-position"]').length === 2`, `${viewport.name}: Gate B step 5 failed — two distinct teammate positions were not preserved`);
  const positions = await client.evaluate(`[...document.querySelectorAll('[data-testid="crew-position"]')].map((element) => element.textContent.trim())`);
  assert.notEqual(positions[0], positions[1], `${viewport.name}: teammate disagreement collapsed into synthetic consensus`);

  await activate(client, "terrain-turn-into-pipeline", "Turn into pipeline", `${viewport.name}: Gate B step 6 could not turn the hypothesis into a pipeline`, keyboardOnly);
  await waitForDom(client, `(() => { const view = window.__terrainEval.byTestId("unified-canvas"); return !!view?.dataset.channelId; })()`, `${viewport.name}: Gate B step 7 failed — the chosen move was not focused on the continuous canvas`);
  await waitForDom(client, `(() => { const view = window.__terrainEval.byTestId("unified-canvas"); return /intended effect/i.test(view.textContent) && /gate|approval|wall/i.test(view.textContent); })()`, `${viewport.name}: Gate B step 7 failed — the focused pipeline omitted its intended effect or gate consequence`);

  await activate(client, "pipeline-run", "Run", `${viewport.name}: Gate B step 8 could not run the fixture pipeline`, keyboardOnly);
  try {
    await waitForDom(client, `!!window.__terrainEval.byTestId("founder-gate")`, `${viewport.name}: Gate B step 8 failed — the run did not stop at the founder wall`);
  } catch (error) {
    if (process.env.TERRAIN_DEBUG === "1") {
      console.log(`${viewport.name}: wall diagnostics`, await client.evaluate(`({ canvas: (() => { const element = window.__terrainEval.byTestId("unified-canvas"); return element ? { ...element.dataset } : null; })(), runButton: (() => { const element = window.__terrainEval.byTestId("pipeline-run"); if (!element) return null; const r = element.getBoundingClientRect(); return { disabled: element.disabled, rect: [r.left, r.top,r.right, r.bottom] }; })(), gates: [...document.querySelectorAll('[data-testid="founder-gate"]')].length, text: document.querySelector('#root')?.textContent?.slice(-1200) })`));
    }
    throw error;
  }
  assert.equal(await client.evaluate(`!!window.__terrainEval.byTestId("external-release-receipt")`), false, `${viewport.name}: an external release appeared before founder approval`);
  await waitForDom(
    client,
    `window.__terrainEval.visible(window.__terrainEval.byTestId("founder-gate-approve") || window.__terrainEval.byText("Approve"))`,
    `${viewport.name}: the founder wall opened without a visible decision action`,
  );
  await activate(client, "founder-gate-approve", "Approve", `${viewport.name}: Gate B step 9 requires an explicit browser founder action`, keyboardOnly);
  await waitForDom(client, `!!window.__terrainEval.byTestId("gate-approved-receipt")`, `${viewport.name}: Gate B step 9 did not persist the founder decision receipt`);
  await activate(client, "record-outcome", "Record result", `${viewport.name}: Gate B step 9 could not record a joined result`, keyboardOnly);
  await waitForDom(client, `!!window.__terrainEval.byText("Got ignored")`, `${viewport.name}: the outcome recorder did not open`);
  await activate(client, "", "Got ignored", `${viewport.name}: the fixture negative result was not selectable`, keyboardOnly);
  await activate(client, "", "Log what came back", `${viewport.name}: the fixture result could not be saved`, keyboardOnly);
  await waitForDom(client, `!!window.__terrainEval.byTestId("joined-outcome")`, `${viewport.name}: the fixture result was not visibly joined`);
  await activate(client, "", "Done", `${viewport.name}: the joined result receipt could not be closed`, keyboardOnly);

  await waitForDom(client, `(() => { const root = document.querySelector('#root'); return /stale|updated|changed/i.test(root.textContent) && !!window.__terrainEval.byTestId("terrain-product-landmark") && !!window.__terrainEval.byTestId("unified-canvas"); })()`, `${viewport.name}: Gate B step 10 failed — the joined result did not return to affected terrain on the same canvas`);
  const beforeRefresh = await client.evaluate(`({ project: !!document.querySelector('[data-testid="terrain-product-landmark"][data-ref="product-truth:truth-win-event"]'), focus: window.__terrainEval.byTestId("terrain-focus")?.getAttribute("data-ref"), gate: !!window.__terrainEval.byTestId("gate-approved-receipt"), outcome: !!window.__terrainEval.byTestId("joined-outcome") })`);
  if (process.env.TERRAIN_DEBUG === "1") {
    console.log(`${viewport.name}: refresh receipt before`, await client.evaluate(`({ storage: { ...localStorage }, focus: window.__terrainEval.byTestId("terrain-focus")?.getAttribute("data-ref") })`));
  }
  await client.send("Page.reload", { ignoreCache: true });
  await waitForDom(client, "document.readyState === 'complete' && !!document.querySelector('#root')", `${viewport.name}: refresh did not recover the app`);
  await client.evaluate(browserHelpers());
  try {
    await waitForDom(client, `!!window.__terrainEval.byTestId("terrain-focus")`, `${viewport.name}: refresh did not restore the addressed terrain focus`);
  } catch (error) {
    if (process.env.TERRAIN_DEBUG === "1") {
      console.log(`${viewport.name}: refresh receipt after`, await client.evaluate(`({ storage: { ...localStorage }, landmarks: [...document.querySelectorAll('[data-testid^="terrain-"]')].map((element) => ({ testId: element.getAttribute('data-testid'), ref: element.getAttribute('data-ref') })), text: document.querySelector('#root')?.textContent?.slice(0, 500) })`));
    }
    throw error;
  }
  const afterRefresh = await client.evaluate(`({ project: !!document.querySelector('[data-testid="terrain-product-landmark"][data-ref="product-truth:truth-win-event"]'), focus: window.__terrainEval.byTestId("terrain-focus")?.getAttribute("data-ref"), gate: !!window.__terrainEval.byTestId("gate-approved-receipt"), outcome: !!window.__terrainEval.byTestId("joined-outcome") })`);
  assert.deepEqual(afterRefresh, beforeRefresh, `${viewport.name}: Gate B step 11 lost project, focus, gate, or outcome history after refresh`);
  await assertOpenCanvasGoal(client, viewport, keyboardOnly);
  await assertAccessibility(client, viewport);
}

async function assertPartialFailureRecovery(client, proxyBase) {
  const viewport = VIEWPORTS[0];
  await client.send("Emulation.setDeviceMetricsOverride", { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: false });
  await client.send("Page.navigate", { url: proxyBase });
  await waitForDom(client, "document.readyState === 'complete' && !!document.querySelector('#root')", "partial-failure pass did not load");
  const founderSession = await client.evaluate(`fetch('/api/founder-session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: 'terrain-fixture-founder' }) }).then((response) => response.status)`);
  assert.equal(founderSession, 200, "partial-failure pass could not establish the founder action session");
  await client.evaluate(browserHelpers());

  await waitForDom(client, `document.querySelectorAll('[data-testid="terrain-hypothesis"]').length === 3`, "partial-failure pass did not load the terrain hypotheses");
  await activate(client, "terrain-hypothesis", "Make the project brief", "partial-failure pass could not focus a hypothesis", false);
  await activate(client, "terrain-turn-into-pipeline", "Turn into pipeline", "partial-failure pass could not create the fixture pipeline", false);
  await waitForDom(client, `(() => { const view = window.__terrainEval.byTestId("unified-canvas"); return !!view?.dataset.channelId; })()`, "partial-failure pass did not focus the fixture pipeline");
  await activate(client, "pipeline-run", "Run", "partial-failure pass could not run the fixture pipeline", false);

  const partialStateVisible = `(() => {
    const node = (id) => document.querySelector('[data-id="' + id + '"]');
    const source = node('source');
    const draft = node('draft');
    const downstream = ['gate', 'execute', 'measure'].map(node);
    return !!source?.querySelector('.loop-node-done')
      && !!draft?.querySelector('.loop-node-error')
      && downstream.every((element) => !!element?.querySelector('.lucide-ban'));
  })()`;
  const attachedFailureVisible = `(() => { const draft = document.querySelector('[data-id="draft"]'); return (draft?.textContent || '').includes('Fixture drafting runtime stopped before producing copy.'); })()`;
  await waitForDom(client, partialStateVisible, "partial failure did not preserve the completed source, attach the draft error, and block downstream work");
  await waitForDom(client, attachedFailureVisible, "the streamed failure was not attached to the draft step");
  await waitForDom(client, `(() => { const button = document.querySelector('[data-id="draft"] .loop-node-editor-run'); return window.__terrainEval.visible(button) && !button.disabled && /run step/i.test(button.textContent || ''); })()`, "the failed draft did not expose a usable retry action");

  await client.send("Page.reload", { ignoreCache: true });
  await waitForDom(client, "document.readyState === 'complete' && !!document.querySelector('#root')", "partial-failure refresh did not recover the app");
  await client.evaluate(browserHelpers());
  await waitForDom(client, partialStateVisible, "partial-failure refresh lost completed work or downstream blocked state");
  const selectedDraft = await client.evaluate(`(() => { const draft = document.querySelector('[data-id="draft"] .loop-node'); if (!draft) return false; draft.click(); return true; })()`);
  assert.equal(selectedDraft, true, "partial-failure refresh could not reopen the failed draft");
  await waitForDom(client, attachedFailureVisible, "partial-failure refresh detached the failure from its step");
  await waitForDom(client, `(() => { const button = document.querySelector('[data-id="draft"] .loop-node-editor-run'); return window.__terrainEval.visible(button) && !button.disabled && /run step/i.test(button.textContent || ''); })()`, "partial-failure refresh did not preserve the recovery action");
}

async function assertNoRuntimeValue(client, proxyBase) {
  await client.send("Page.navigate", { url: proxyBase });
  await waitForDom(client, "document.readyState === 'complete' && !!document.querySelector('#root')", "no-runtime pass did not load");
  await client.evaluate(browserHelpers());
  await waitForDom(client, `!!window.__terrainEval.byTestId("terrain-product-landmark")`, "no-runtime deterministic value failed — the cited terrain disappeared behind a runtime connection wall");
  assert.equal(await client.evaluate(`!!window.__terrainEval.byTestId("runtime-fullscreen-wall")`), false, "no-runtime state replaced deterministic terrain with a connection wall");
}

async function launchEvaluatedChrome(url, errors) {
  const chrome = await launchChrome({ port: await freePort(), url });
  await chrome.client.send("Page.addScriptToEvaluateOnNewDocument", { source: `
    (() => {
      window.__droverTerrainCounts = [];
      const attach = () => {
        let last = -1;
        const sample = () => {
          const count = document.querySelectorAll('[data-testid="terrain-hypothesis"]').length;
          if (count !== last && count > 0) { last = count; window.__droverTerrainCounts.push(count); }
        };
        new MutationObserver(sample).observe(document.documentElement, { childList: true, subtree: true });
        sample();
      };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attach, { once: true });
      else attach();
    })();
  ` });
  chrome.client.on("Runtime.exceptionThrown", ({ exceptionDetails }) => errors.push(exceptionDetails.exception?.description || exceptionDetails.text));
  chrome.client.on("Runtime.consoleAPICalled", ({ type, args }) => {
    if (type === "error") errors.push(`console.error: ${args.map((arg) => arg.value ?? arg.description ?? "").join(" ")}`);
  });
  chrome.client.on("Log.entryAdded", ({ entry }) => { if (entry.level === "error") errors.push(entry.text); });
  return chrome;
}

async function closeEvaluatedChrome(chrome, errors) {
  if (!chrome) return;
  const unhandled = await chrome.client.evaluate("window.__droverUnhandledRejections || []").catch(() => []);
  errors.push(...unhandled.map((message) => `Unhandled rejection: ${message}`));
  await chrome.close();
}

async function main() {
  let drover;
  let proxy;
  let disconnectedProxy;
  let chrome;
  const errors = [];
  try {
    drover = await bootDrover();
    proxy = await bootFixtureProxy(drover, { runtimeConnected: true });
    if (process.env.TERRAIN_DEBUG_HOLD === "1") {
      console.log(`Gate B debug fixture: ${proxy.base}`);
      await new Promise((resolve) => process.once("SIGINT", resolve));
      return;
    }
    const selectedViewports = process.env.TERRAIN_VIEWPORT
      ? VIEWPORTS.filter((viewport) => viewport.name === process.env.TERRAIN_VIEWPORT)
      : VIEWPORTS;
    for (const viewport of selectedViewports) {
      console.log(`Gate B: ${viewport.width}x${viewport.height}`);
      proxy.reset();
      chrome = await launchEvaluatedChrome(proxy.base, errors);
      try { await runJourney(chrome.client, viewport); }
      catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
      await closeEvaluatedChrome(chrome, errors);
      chrome = null;
    }
    if (!process.env.TERRAIN_VIEWPORT) {
      console.log("Gate B: keyboard-only");
      proxy.reset();
      chrome = await launchEvaluatedChrome(proxy.base, errors);
      try { await runJourney(chrome.client, VIEWPORTS[0], { keyboardOnly: true }); }
      catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
      await closeEvaluatedChrome(chrome, errors);
      chrome = null;

      console.log("Gate B: partial-failure recovery");
      proxy.reset();
      proxy.failNextRun();
      chrome = await launchEvaluatedChrome(proxy.base, errors);
      try { await assertPartialFailureRecovery(chrome.client, proxy.base); }
      catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
      await closeEvaluatedChrome(chrome, errors);
      chrome = null;
    }

    disconnectedProxy = await bootFixtureProxy(drover, { runtimeConnected: false });
    console.log("Gate B: no-runtime deterministic value");
    chrome = await launchEvaluatedChrome(disconnectedProxy.base, errors);
    try { await assertNoRuntimeValue(chrome.client, disconnectedProxy.base); }
    catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
    await closeEvaluatedChrome(chrome, errors);
    chrome = null;
    assert.deepEqual(errors, [], `Gate B deterministic browser failures:\n- ${errors.join("\n- ")}`);
    console.log("Gate B passed at 1440x900, 1024x768, 390x844, keyboard-only, refresh, partial-failure recovery, and no-runtime modes.");
  } finally {
    await chrome?.close();
    await disconnectedProxy?.close();
    await proxy?.close();
    await drover?.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
