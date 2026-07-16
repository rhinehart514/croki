#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { test } from "node:test";
import { launchChrome } from "./lib/cdp.mjs";
import { createBet } from "../../brain/src/firm/bet.mjs";
import { summon } from "../../brain/src/firm/crew.mjs";
import { recordOutcome } from "../../brain/src/firm/market.mjs";
import { setVentureDoc } from "../../brain/src/firm/venture-store.mjs";
import { park } from "../../brain/src/firm/wall.mjs";
import { applyFirmConfiguration, getFirmConfiguration } from "../../brain/src/firm/configuration.mjs";
import { appendConversationMessage, listConversation } from "../../brain/src/firm/conversation.mjs";
import { applyArchitectureMutations } from "../../brain/src/firm/architecture.mjs";
import { proposeArchitectureChange } from "../../brain/src/firm/architecture-proposals.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const PRODUCT_REPOSITORY = path.join(ROOT, "samples/acme-saas");
const ORBITAL_EVIDENCE = path.join(ROOT, "docs/design/evidence/orbital-atlas");

async function captureOrbitalEvidence(client, name) {
  fs.mkdirSync(ORBITAL_EVIDENCE, { recursive: true });
  const screenshot = await client.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  fs.writeFileSync(path.join(ORBITAL_EVIDENCE, `${name}.png`), Buffer.from(screenshot.data, "base64"));
}

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
    const requestHeaders = Object.entries({
      ...request.headers,
      "x-drover-founder-capability": signFounderRequest(secret, request.method, request.url),
    }).map(([name, value]) => ({ name, value: String(value) }));
    // A component unmount may cancel a paused poll before CDP receives the continuation. The next
    // poll still gets its own claim; an invalidated interception id is not an authority bypass.
    void client.send("Fetch.continueRequest", { requestId, headers: requestHeaders }).catch(() => {});
  });
  await client.send("Fetch.enable", {
    patterns: [{ urlPattern: `${base}/api/*`, requestStage: "Request" }],
  });
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

async function waitForServer(url, child) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (child.exitCode !== null) throw new Error("Drover exited before becoming ready.");
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Still starting.
    }
    await delay(50);
  }
  throw new Error(`Drover did not become ready at ${url}.`);
}

async function waitForDom(client, expression, message) {
  for (let attempt = 0; attempt < 160; attempt += 1) {
    if (await client.evaluate(expression).catch(() => false)) return;
    await delay(50);
  }
  throw new Error(message);
}

async function assertPrimaryButtonLabelIsVisible(client, label, disabled) {
  const state = await client.evaluate(`(() => {
    const button = [...document.querySelectorAll('button')]
      .find((entry) => entry.textContent.trim().toLowerCase() === ${JSON.stringify(label.toLowerCase())});
    if (!button) return null;
    const style = getComputedStyle(button);
    return { color: style.color, backgroundColor: style.backgroundColor, disabled: button.disabled };
  })()`);
  assert.ok(state, `missing ${label} button`);
  assert.equal(state.disabled, disabled, `${label} disabled state changed`);
  assert.notEqual(state.color, state.backgroundColor, `${label} label has no contrast`);
}

async function assertIconButtonActionIsVisible(client, label, disabled) {
  const state = await client.evaluate(`(() => {
    const button = [...document.querySelectorAll('button')]
      .find((entry) => entry.getAttribute('aria-label')?.toLowerCase() === ${JSON.stringify(label.toLowerCase())});
    if (!button) return null;
    const icon = button.querySelector('svg');
    const style = getComputedStyle(button);
    return { color: style.color, backgroundColor: style.backgroundColor, disabled: button.disabled, hasIcon: !!icon };
  })()`);
  assert.ok(state, `missing ${label} action`);
  assert.equal(state.disabled, disabled, `${label} disabled state changed`);
  assert.equal(state.hasIcon, true, `${label} has no visible icon`);
  assert.notEqual(state.color, state.backgroundColor, `${label} icon has no contrast`);
}

async function bootDrover() {
  const port = await freePort();
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "drover-firm-browser-store-"));
  const founderCapability = crypto.randomBytes(32).toString("base64url");
  const env = {
    ...process.env,
    GTM_IDE_HOME: home,
    GTM_IDE_PERSISTENCE: "json",
    GTM_IDE_DISABLE_CLAUDE_CODE: "1",
    GTM_IDE_FOUNDER_CAPABILITY: founderCapability,
    HOST: "127.0.0.1",
    PORT: String(port),
  };
  const child = spawn(process.execPath, [path.join(ROOT, "brain/src/server.mjs")], {
    cwd: PRODUCT_REPOSITORY,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk; });
  child.stderr.on("data", (chunk) => { output += chunk; });
  const base = `http://127.0.0.1:${port}`;
  try {
    await waitForServer(`${base}/api/health`, child);
    return {
      base, home, child, founderCapability,
      async close() {
        child.kill("SIGTERM");
        await Promise.race([once(child, "exit"), delay(2000).then(() => child.kill("SIGKILL"))]);
        fs.rmSync(home, { recursive: true, force: true });
      },
    };
  } catch (error) {
    child.kill("SIGTERM");
    fs.rmSync(home, { recursive: true, force: true });
    throw new Error(`${error.message}\n${output}`);
  }
}

function setControl(selector, value) {
  return `(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) return false;
    const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, ${JSON.stringify(value)});
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`;
}

test("desktop firm journey: bind product, set heat, and render purpose-correct wall decisions", async () => {
  const drover = await bootDrover();
  const chrome = await launchChrome({
    port: await freePort(),
    url: drover.base,
    beforeNavigate: (client) => installFounderHost(client, drover.base, drover.founderCapability),
  });
  try {
    const { client } = chrome;
    await client.send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
    await client.send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-motion", value: "reduce" }],
    });
    assert.equal(await client.evaluate(`matchMedia('(prefers-reduced-motion: reduce)').matches`), true);
    await waitForDom(client, `/Start your first venture/i.test(document.body.textContent)`, "venture picker did not render");
    await waitForDom(client, `/Selected/.test(document.body.textContent) && /Current workspace/.test(document.body.textContent)`, "local product folder was not selected");
    await assertPrimaryButtonLabelIsVisible(client, "Start venture", false);
    assert.equal(await client.evaluate(setControl('[aria-label="New venture name"]', "Acme firm")), true);
    assert.equal(await client.evaluate(`(() => { const button = [...document.querySelectorAll('button')].find((entry) => /start venture/i.test(entry.textContent)); button?.click(); return !!button; })()`), true);
    await waitForDom(client, `Boolean(document.querySelector('[data-venture-atlas], [aria-label="The firm: configured participants, their bets, and the wall."]'))`, "venture operating surface did not open");

    await waitForDom(client, `!!document.querySelector('.firm-app-rail .firm-app-composer textarea')`, "firm conversation composer did not render");
    await assertIconButtonActionIsVisible(client, "Explore this venture", true);
    assert.equal(await client.evaluate(`(() => {
      const textarea = document.querySelector('.firm-app-composer textarea');
      if (!textarea) return false;
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(textarea, 'Reach the first buyer');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    })()`), true);
    await waitForDom(client, `[...document.querySelectorAll('button')].some((entry) => entry.getAttribute('aria-label') === 'Explore this venture' && !entry.disabled)`, "direction did not enable");
    await assertIconButtonActionIsVisible(client, "Explore this venture", false);
    assert.equal(await client.evaluate(`!!document.querySelector('.firm-app-composer [aria-label="Scope locked while you write"]')`), true);
    assert.equal(await client.evaluate(`!!document.querySelector('.firm-app-rail .firm-app-composer') && !document.querySelector('.firm-app-canvas .firm-app-composer')`), true);

    const [venture] = await client.evaluate(`fetch('/api/ventures').then((response) => response.json()).then((body) => body.ventures)`);
    assert.equal(venture.repository, fs.realpathSync(PRODUCT_REPOSITORY));

    const options = { root: drover.home };
    summon(venture.id, "outreach-writer", {}, options);
    summon(venture.id, "evidence-reviewer", {}, options);
    const configuration = getFirmConfiguration(venture.id, options);
    applyFirmConfiguration({
      ventureId: venture.id,
      expectedRevision: configuration.revision,
      configuration: {
        ...configuration,
        organization: {
          ...configuration.organization,
          relationships: [{
            from: "evidence-reviewer", to: "outreach-writer", kind: "challenges", label: "independent review",
          }],
        },
        coordination: { ...configuration.coordination, coordinatorRef: "outreach-writer" },
        agents: [
          { ref: "outreach-writer", name: "Sable", label: "Value auditor" },
          { ref: "evidence-reviewer", name: "Mara", label: "Evidence reviewer" },
        ],
      },
      summary: "Add Sable to the firm",
    }, options);
    appendConversationMessage({
      ventureId: venture.id,
      role: "teammate",
      content: "The value claim needs independent evidence before it carries the decision.",
      teammateRef: "evidence-reviewer",
      coordination: {
        requestedBy: "outreach-writer",
        protocol: "consult",
        question: "Is the current value claim evidenced strongly enough?",
      },
    }, options);
    const configured = getFirmConfiguration(venture.id, options);
    const architectureResult = applyArchitectureMutations({
      ventureId: venture.id,
      baseRevision: 0,
      actor: { authority: "founder", id: "jacob" },
      reason: "Give the configured firm a founder-facing operating route.",
      operations: [
        { op: "update-intent", value: { statement: "Reach the first buyer with a repository-grounded promise." } },
        { op: "create-element", element: { id: "acme-system-evidence", role: "system", name: "Evidence review", does: "Challenges value claims against repository truth.", provenance: { kind: "founder-authored", createdAt: new Date().toISOString() } } },
        { op: "create-element", element: { id: "acme-motion-buyer", role: "motion", name: "Repository-grounded buyer outreach", actor: "Operations lead", entry: "A recurring handoff problem", value: "A narrow product-backed invitation", systemIds: ["acme-system-evidence"], productRefs: [], repeatabilityClaim: "Evidence review can repeatedly narrow outreach before release.", provenance: { kind: "founder-authored", createdAt: new Date().toISOString() } } },
      ],
    }, options);
    await waitForDom(client, `Boolean(document.querySelector('[data-venture-atlas]')) && /Repository-grounded buyer outreach/.test(document.body.textContent)`, "configured firm did not settle behind the venture architecture");

    const configuredTruth = await client.evaluate(`fetch('/api/ventures/${venture.id}/configuration').then((response) => response.json()).then(({ configuration }) => ({
      names: configuration.agents.map((agent) => agent.name),
      relationship: configuration.organization.relationships[0]?.label,
      coordinator: configuration.coordination.coordinatorRef,
    }))`);
    assert.deepEqual(configuredTruth, { names: ["Sable", "Mara"], relationship: "independent review", coordinator: "outreach-writer" });
    assert.equal(await client.evaluate(`document.querySelectorAll('.firm-lens-participant-card, .firm-lens-crew-node').length`), 0, "configured teammates returned as primary Atlas objects");

    await client.evaluate(`(() => {
      const textarea = document.querySelector('.firm-app-composer textarea');
      if (!textarea) return;
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(textarea, '');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    // Placement is engine-owned now: the retired orbit layout's decision-proximity sectors are gone,
    // so path names ride the effort card kicker rather than a background sector label. With no efforts
    // open yet the atlas renders the intent hub only — no effort cards, no primary teammate cards.
    const configuredAtlas = await client.evaluate(`({
      atlas: Boolean(document.querySelector('[data-venture-atlas]')),
      intentHub: Boolean(document.querySelector('.atlas-intent-node')),
      betCount: document.querySelectorAll('.atlas-bet-node').length,
      primaryTeammateCards: document.querySelectorAll('.firm-lens-participant-card, .firm-lens-crew-node').length,
    })`);
    assert.deepEqual(configuredAtlas, { atlas: true, intentHub: true, betCount: 0, primaryTeammateCards: 0 });

    const wallCountBeforeProposal = (await client.evaluate(`fetch('/api/ventures/${venture.id}/lens').then((response) => response.json()).then(({ lens }) => lens.wall.count)`));
    proposeArchitectureChange({
      ventureId: venture.id,
      baseRevision: architectureResult.revision,
      intent: "Stage a three-motion GTM system without starting execution.",
      operations: [
        { op: "create-element", element: { id: "motion-plg", role: "motion", name: "Product-led growth", actor: "Product-qualified builder", entry: "Useful product moment", value: "Repeatable self-serve adoption", systemIds: ["acme-system-evidence"], productRefs: [], repeatabilityClaim: "Repository evidence will test whether self-serve value repeats." } },
        { op: "create-element", element: { id: "motion-founder-outbound", role: "motion", name: "Founder-led outbound", actor: "Founder", entry: "Narrow evidence-backed account list", value: "Qualified buyer conversation", systemIds: ["acme-system-evidence"], productRefs: [], repeatabilityClaim: "A founder can repeat a narrow, evidence-backed invitation." } },
        { op: "create-element", element: { id: "motion-content", role: "motion", name: "Content and SEO", actor: "Problem-aware operator", entry: "Repository-grounded field note", value: "Compounding qualified discovery", systemIds: ["acme-system-evidence"], productRefs: [], repeatabilityClaim: "Field notes compound only when they preserve product truth." } },
      ],
      affectedExecutionContexts: [],
      unresolvedAssumptions: ["Campaigns still need governing bets before they can be proposed honestly."],
      expectedExecutionEffect: "No execution changes until the founder accepts; outward acts still stop at the wall.",
      proposedBy: { authority: "agent", id: "browser-teammate", configurationRevision: configured.revision },
    }, options);
    await waitForDom(client, `Boolean(document.querySelector('.atlas-proposal-surface')) && document.querySelectorAll('.atlas-proposal-objects > li[data-role="motion"]').length === 3`, "the real three-motion proposal did not materialize on the Atlas");
    assert.equal(await client.evaluate(`(() => {
      const card = document.querySelector('.atlas-proposal-objects > li[data-role="motion"]');
      return card ? getComputedStyle(card).backgroundColor === 'rgb(241, 232, 234)' : true;
    })()`), false, "proposed motions retained the undeclared rose fill");
    await captureOrbitalEvidence(client, "03-real-proposal");
    const proposalCopy = await client.evaluate(`document.querySelector('.atlas-proposal-surface')?.textContent || ''`);
    assert.match(proposalCopy, /3 routes/i);
    assert.match(proposalCopy, /nothing|no execution changes/i);
    assert.match(proposalCopy, /sequence of steps, approval counts, or teammate assignments/i);
    assert.doesNotMatch(proposalCopy, /reasoning progress/i);
    assert.equal(await client.evaluate(`(() => { const button = [...document.querySelectorAll('.atlas-proposal-adjustments button')].find((entry) => /Adjust path/i.test(entry.textContent || '')); button?.click(); return Boolean(button); })()`), true, "proposed paths did not expose an adjustment route");
    await waitForDom(client, `/Revise the proposed path/.test(document.querySelector('.firm-app-composer textarea')?.value || '')`, "adjusting a path did not return a grounded revision ask to conversation");
    await client.evaluate(`(() => { const textarea = document.querySelector('.firm-app-composer textarea'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(textarea, ''); textarea.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    assert.equal(await client.evaluate(`(() => { const button = [...document.querySelectorAll('.atlas-proposal-heading-actions button')].find((entry) => /Accept whole proposal/i.test(entry.textContent || '')); button?.click(); return Boolean(button); })()`), true, "the proposal did not expose whole-system acceptance");
    await waitForDom(client, `!document.querySelector('.atlas-proposal-surface') && [...document.querySelectorAll('.atlas-element')].some((entry) => /Product-led growth/i.test(entry.textContent || ''))`, "accepted proposal did not convert into the real venture projection");
    assert.equal(await client.evaluate(`fetch('/api/ventures/${venture.id}/lens').then((response) => response.json()).then(({ lens }) => lens.wall.count)`), wallCountBeforeProposal, "accepting architecture moved an outward act past the wall");

    const liveBetIntents = [
      "Make the first useful product moment self-evident",
      "Turn successful setup into a repeatable invitation",
      "Reach operations leaders with one grounded claim",
      "Learn which buyer language earns a reply",
      "Publish the recurring handoff problem in buyer words",
      "Connect repository proof to problem-aware searches",
      "Measure which motion returns qualified conversations",
    ];
    const liveBets = liveBetIntents.map((intent, index) => createBet({
      ventureId: venture.id,
      intent,
      teammateRef: index % 2 ? "evidence-reviewer" : "outreach-writer",
    }));
    liveBets.forEach((entry) => setVentureDoc(venture.id, "bets", entry.id, entry, options));
    const currentArchitectureRevision = await client.evaluate(`fetch('/api/ventures/${venture.id}/architecture').then((response) => response.json()).then(({ revision }) => revision)`);
    const motionIds = ["motion-plg", "motion-founder-outbound", "motion-content"];
    applyArchitectureMutations({
      ventureId: venture.id,
      baseRevision: currentArchitectureRevision,
      actor: { authority: "founder", id: "jacob" },
      reason: "Bind seven live acceptance bets to the accepted motion system.",
      operations: liveBets.map((entry, index) => ({
        op: "create-element",
        element: {
          id: `campaign-browser-${index + 1}`,
          role: "campaign",
          name: `Acceptance campaign ${index + 1}`,
          audience: "Repository-grounded buyer",
          objective: entry.intent,
          primaryMotionId: motionIds[index % motionIds.length],
          motionIds: [motionIds[index % motionIds.length]],
          governingBetId: entry.id,
          supportingBetIds: [],
          measurement: { observation: "A qualified buyer response", window: "Within the founder-set review boundary" },
          bounds: { startsAt: new Date().toISOString(), endsAt: null },
        },
      })),
    }, options);

    await client.send("Page.reload", { ignoreCache: true });
    await waitForDom(client, `/Continue a venture/i.test(document.body.textContent)`, "venture picker did not return after configured machinery reload");
    assert.equal(await client.evaluate(`(() => { const button = [...document.querySelectorAll('button')].find((entry) => /Acme firm/.test(entry.textContent || '')); button?.click(); return Boolean(button); })()`), true);
    await waitForDom(client, `Boolean(document.querySelector('[data-venture-atlas]')) && [...document.querySelectorAll('.atlas-element')].some((entry) => /Product-led growth/i.test(entry.textContent || ''))`, "configured Atlas did not survive reload");
    await waitForDom(client, `/7 lines underway.*nothing needs you/i.test(document.body.textContent) && document.querySelectorAll('.atlas-bet-node[data-position="live"]').length === 7`, "the seven active lines and clear decision boundary did not agree between header and orbit");
    assert.equal(await client.evaluate(`new Set([...document.querySelectorAll('.atlas-bet-node[data-position="live"]')].map((entry) => entry.querySelector('.atlas-bet-summary small')?.textContent)).size`), 3, "the seven live bets were not grouped across the accepted motions");
    assert.deepEqual(await client.evaluate(`(() => {
      const cards = [...document.querySelectorAll('.atlas-bet-node')];
      const collisions = [];
      for (let index = 0; index < cards.length; index += 1) {
        const a = cards[index].getBoundingClientRect();
        for (let other = index + 1; other < cards.length; other += 1) {
          const b = cards[other].getBoundingClientRect();
          if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) collisions.push([cards[index].textContent, cards[other].textContent]);
        }
      }
      return collisions;
    })()`), [], "orbit bet cards overlap at the default camera");
    const foldedWallBounds = await client.evaluate(`(() => {
      const wall = document.querySelector('[data-atlas-kind="wall"]')?.getBoundingClientRect();
      return wall ? { left: wall.left, right: wall.right, viewport: innerWidth, inset: wall.right <= innerWidth - 24 && wall.left >= 24 } : null;
    })()`);
    assert.equal(foldedWallBounds?.inset, true, `the folded wall receipt was not inset from the viewport edge: ${JSON.stringify(foldedWallBounds)}`);
    await captureOrbitalEvidence(client, "00-seven-live-wall-clear");
    assert.equal(await client.evaluate(`(() => {
      const button = [...document.querySelectorAll('button')].find((entry) => /conversation/i.test(entry.textContent || '') && entry.hasAttribute('aria-pressed'));
      if (button?.getAttribute('aria-pressed') === 'false') button.click();
      return Boolean(button);
    })()`), true, "Conversation did not expose durable configured-participant history");
    assert.equal(listConversation(venture.id, options).some((message) => /independent evidence/.test(message.content)), true, "configured teammate contribution did not remain durable");

    const bet = createBet({
      ventureId: venture.id,
      intent: "invite operations leads",
      teammateRef: "outreach-writer",
      staged: [{
        id: "artifact-precise-invitation",
        title: "Precise invitation",
        content: "A precise invitation grounded in the value claim.",
        ownerRefs: ["outreach-writer"],
        contributorRefs: ["evidence-reviewer"],
        configurationRevision: configured.revision,
      }, {
        id: "artifact-counterexample",
        title: "Independent counterexample",
        content: "A buyer without a recurring handoff should reject this promise.",
        ownerRefs: ["evidence-reviewer"],
        contributorRefs: ["outreach-writer"],
        configurationRevision: configured.revision,
      }],
    });
    setVentureDoc(venture.id, "bets", bet.id, bet, options);
    park({ ventureId: venture.id, betId: bet.id, workRef: "artifact-precise-invitation", purpose: "release", effect: { kind: "message", to: "lead@example.com", body: "A precise invitation" } }, options);
    park({ ventureId: venture.id, betId: bet.id, purpose: "answer", effect: { question: "Which segment deserves the first pass?" } }, options);
    park({ ventureId: venture.id, betId: bet.id, purpose: "end-bet", effect: { kind: "kill-proposal", reason: "The angle may be exhausted" } }, options);
    recordOutcome({ ventureId: venture.id, joinKey: bet.joinKey, workRef: "artifact-precise-invitation", outcomeKind: "reply", body: "Tell me more", providerEventId: "browser-fixture-reply" }, options);

    await waitForDom(client, `/4 decisions need you/i.test(document.body.textContent)`, "the four founder-attention items did not reach the Atlas");
    await waitForDom(client, `Promise.all([
      fetch('/api/ventures/${venture.id}/lens').then((response) => response.json()),
      fetch('/api/ventures/${venture.id}/wall').then((response) => response.json()),
    ]).then(([{ lens }, wall]) => lens.bets.some((entry) => /invite operations leads/i.test(entry.intent) && entry.stagedCount === 2) && wall.queue.some((entry) => entry.workRef === 'artifact-precise-invitation'))`, "exact staged work did not remain inspectable behind the Atlas wall");
    await waitForDom(client, `Boolean([...document.querySelectorAll('.atlas-bet-node')].find((entry) => /invite operations leads/i.test(entry.textContent || '')))`, "the new live bet did not materialize on the orbital canvas");
    assert.equal(await client.evaluate(`(() => {
      const button = [...document.querySelectorAll('.atlas-bet-summary')].find((entry) => /invite operations leads/i.test(entry.textContent || ''));
      button?.click(); return Boolean(button);
    })()`), true, "the bet could not unfold in place");
    await waitForDom(client, `Boolean(document.querySelector('.atlas-bet-workflow')) && /Precise invitation/.test(document.querySelector('.atlas-bet-workflow')?.textContent || '')`, "the unfolded bet did not show its real staged work");
    assert.equal(await client.evaluate(`(() => { const button = [...document.querySelectorAll('.atlas-bet-workflow button')].find((entry) => /Inspect this work/i.test(entry.textContent || '')); button?.click(); return Boolean(button); })()`), true, "the active line did not expose its deeper evidence view");
    await waitForDom(client, `Boolean(document.querySelector('.atlas-dive')) && !document.querySelector('.atlas-dive-inspector')`, "the deeper evidence view did not open with its consequence held closed");
    assert.equal(await client.evaluate(`(() => { const button = [...document.querySelectorAll('.atlas-dive button')].find((entry) => /Inspect held act/i.test(entry.textContent || '')); button?.click(); return Boolean(button); })()`), true, "the held consequence did not expose its named inspector action");
    await waitForDom(client, `Boolean(document.querySelector('.atlas-dive-inspector'))`, "the named held-act action did not open its consequence inspector");
    assert.equal(await client.evaluate(`(() => {
      const title = [...document.querySelectorAll('.atlas-dive-node-heading strong')].find((entry) => /Independent counterexample/i.test(entry.textContent || ''));
      if (!title) return false;
      const style = getComputedStyle(title);
      return style.overflowWrap === 'normal' && style.wordBreak === 'normal' && style.hyphens === 'none';
    })()`), true, "Dive stage titles still allowed mid-word breaks");
    await captureOrbitalEvidence(client, "02-dive-gate");
    assert.match(await client.evaluate(`document.querySelector('.atlas-dive')?.textContent || ''`), /Precise invitation|A precise invitation/i);
    assert.doesNotMatch(await client.evaluate(`document.querySelector('.atlas-dive-gaps')?.textContent || ''`), /canonical workflow-stage graph/i);
    assert.equal(await client.evaluate(`(() => { const button = [...document.querySelectorAll('.atlas-dive button')].find((entry) => /Fold back to orbit/i.test(entry.textContent || '')); button?.click(); return Boolean(button); })()`), true, "dive did not fold back to the orbit");
    await waitForDom(client, `Boolean(document.querySelector('[data-venture-atlas]')) && !document.querySelector('.atlas-dive')`, "the orbit did not restore after dive");
    // In the docked ADE grid the composer lives in the rail cell, off the stage entirely — so
    // stage cards can never be occluded by it. The camera fits the collision-free field into the
    // stage cell (.firm-app-canvas); cards settle inset within that cell and clear of the return
    // band that floats over the stage top.
    await waitForDom(client, `(() => {
      const cards = [...document.querySelectorAll('.atlas-bet-node[data-expanded="false"]')];
      const stage = document.querySelector('.firm-app-canvas')?.getBoundingClientRect();
      const band = document.querySelector('.atlas-return-band')?.getBoundingClientRect();
      const wall = document.querySelector('[data-atlas-kind="wall"]')?.getBoundingClientRect();
      return Boolean(stage && wall && wall.right <= innerWidth - 24 && cards.length && cards.every((card) => {
        const rect = card.getBoundingClientRect();
        return rect.left >= stage.left - 1 && rect.right <= stage.right + 1 && (!band || rect.top >= band.bottom + 12 || rect.left >= band.right - 1 || rect.right <= band.left + 1);
      }));
    })()`, "the Atlas camera did not settle clear of its docked chrome");
    const floatingClearance = await client.evaluate(`(() => {
      const rail = document.querySelector('.firm-app-rail')?.getBoundingClientRect();
      const stage = document.querySelector('.firm-app-canvas')?.getBoundingClientRect();
      const inspector = document.querySelector('.firm-app-inspector')?.getBoundingClientRect();
      const controls = document.querySelector('.atlas-controls')?.getBoundingClientRect();
      const overlaps = (a, b) => Boolean(a && b && a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom && a.bottom > b.top);
      // The docked grid cells never overlap one another — a panel with a cell cannot bleed onto
      // the stage. The atlas controls float over the stage but stay inside its cell.
      const clear = !overlaps(rail, stage) && !overlaps(inspector, stage) && Boolean(!controls || (controls.left >= stage.left - 1 && controls.right <= stage.right + 1));
      const pick = (rect) => rect && ({ left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom });
      return { clear, rail: pick(rail), stage: pick(stage), inspector: pick(inspector), controls: pick(controls) };
    })()`);
    assert.equal(floatingClearance.clear, true, `the docked rail, stage, and inspector cells still share the same screen region: ${JSON.stringify(floatingClearance)}`);
    assert.equal(await client.evaluate(`(() => {
      const workflow = document.querySelector('.atlas-bet-workflow ol');
      return Boolean(workflow && workflow.scrollWidth <= workflow.clientWidth + 1);
    })()`), true, "the unfolded workflow still clips its final stage");
    assert.deepEqual(await client.evaluate(`(() => {
      const cards = [...document.querySelectorAll('.atlas-bet-node')];
      const collisions = [];
      for (let index = 0; index < cards.length; index += 1) {
        const a = cards[index].getBoundingClientRect();
        for (let other = index + 1; other < cards.length; other += 1) {
          const b = cards[other].getBoundingClientRect();
          if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) collisions.push([cards[index].textContent, cards[other].textContent]);
        }
      }
      return collisions;
    })()`), [], "orbit cards overlap after the at-wall bet unfolds in the field");
    const chromeClearance = await client.evaluate(`(() => {
      const cards = [...document.querySelectorAll('.atlas-bet-node[data-expanded="false"]')];
      const stage = document.querySelector('.firm-app-canvas')?.getBoundingClientRect();
      const band = document.querySelector('.atlas-return-band')?.getBoundingClientRect();
      if (!stage) return { clear: false, reason: 'stage missing' };
      const violations = cards.flatMap((card) => {
        const rect = card.getBoundingClientRect();
        const insideStage = rect.left >= stage.left - 1 && rect.right <= stage.right + 1;
        const clearOfBand = !band || rect.top >= band.bottom + 12 || rect.left >= band.right - 1 || rect.right <= band.left + 1;
        return insideStage && clearOfBand ? [] : [{ text: card.textContent, top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right }];
      });
      return { clear: violations.length === 0, violations, stage, bandBottom: band?.bottom ?? null };
    })()`);
    assert.equal(chromeClearance.clear, true, `folded orbit cards are occluded by the return band or bleed outside the stage cell: ${JSON.stringify(chromeClearance)}`);
    const activeWallBounds = await client.evaluate(`(() => {
      const wall = document.querySelector('[data-atlas-kind="wall"]')?.getBoundingClientRect();
      return wall ? { left: wall.left, right: wall.right, viewport: innerWidth, inset: wall.right <= innerWidth - 24 && wall.left >= 24 } : null;
    })()`);
    assert.equal(activeWallBounds?.inset, true, `the active wall receipt was not inset from the viewport edge: ${JSON.stringify(activeWallBounds)}`);
    await captureOrbitalEvidence(client, "01-live-orbit");
    assert.equal(await client.evaluate(`(() => { const button = document.querySelector('[data-atlas-wall] .firm-lens-wall-band'); button?.click(); return Boolean(button); })()`), true, "the Atlas wall boundary did not open");
    await waitForDom(client, `!!document.querySelector('[aria-label="Founder decisions"]')`, "founder decision review did not open");
    assert.equal(await client.evaluate(`(async () => {
      for (const button of document.querySelectorAll('.firm-wall-queue button')) {
        button.click();
        await new Promise(requestAnimationFrame);
        if (/A precise invitation/.test(document.querySelector('.firm-wall-review')?.textContent || '')) return true;
      }
      return false;
    })()`), true, "exact staged release was not addressable in the wall queue");
    await waitForDom(client, `/A precise invitation/.test(document.querySelector('.firm-wall-review')?.textContent || '')`, "workpiece opened the wrong wall item");
    const actions = await client.evaluate(`(async () => {
      const labels = new Set();
      for (const button of document.querySelectorAll('.firm-wall-queue button')) {
        button.click();
        await new Promise(requestAnimationFrame);
        for (const action of document.querySelectorAll('.firm-wall-review-actions button')) labels.add(action.textContent.trim());
      }
      return [...labels];
    })()`);
    for (const expected of ["Release", "Reject", "Answer", "Dismiss", "Acknowledge", "End this work", "Keep it going"]) {
      assert.ok(actions.includes(expected), `missing ${expected} action`);
    }

    await client.evaluate(`document.querySelector('[data-atlas-wall] .firm-lens-wall-band')?.click()`);
    await waitForDom(client, `!document.querySelector('[aria-label="Founder decisions"]')`, "decision review did not close back to the Atlas boundary");
    assert.equal(await client.evaluate(`(() => {
      const button = [...document.querySelectorAll('button')].find((entry) => entry.textContent.trim() === 'Settings');
      button?.click();
      return Boolean(button);
    })()`), true, "venture settings action disappeared");
    await waitForDom(client, `!!document.querySelector('.firm-settings-panel')`, "venture settings did not open");
    await waitForDom(client, `!!document.querySelector('.firm-always-on input[type="checkbox"]')`, "firm settings did not expose always-on work");
    await client.evaluate(`document.querySelector('.firm-always-on input[type="checkbox"]')?.click()`);
    await waitForDom(client, `!!document.querySelector('.firm-always-on input[type="number"]')`, "enabling always-on work did not expose its spend rail");
    assert.equal(await client.evaluate(setControl('.firm-always-on input[type="number"]', "4")), true);
    await client.evaluate(`(() => { const button = [...document.querySelectorAll('.firm-always-on button')].find((entry) => /save setting/i.test(entry.textContent)); button?.click(); return !!button; })()`);
    await waitForDom(client, `fetch('/api/ventures/${venture.id}/heat').then((response) => response.json()).then((heat) => heat.heat === 'steady' && heat.dailySpendUsd === 4)`, "heat setting did not persist");

    const unhandled = await client.evaluate("window.__droverUnhandledRejections || []");
    assert.deepEqual(unhandled, []);
  } finally {
    await chrome.close();
    await drover.close();
  }
});
