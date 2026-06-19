#!/usr/bin/env node
// Measurability Mirror — comprehension v0 (deterministic floor).
//
// This is the static-analysis layer (approach #1): it gathers FACTS about a repo —
// stack, whether any analytics is wired, candidate funnel touchpoints, attribution
// signals — with a file:line for every finding. No LLM yet; Claude interpretation
// layers on top of this grounded evidence next.
//
//   node src/mirror.mjs <repo-path>
//
// Output: a JSON evidence bundle + a plain-English headline. Every claim is cited
// or explicitly marked blind — the honesty rule, enforced in code.

import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] || '.');

const SKIP_DIRS = new Set([
  'node_modules', '.git', '.next', 'dist', 'build', '.turbo', 'coverage',
  '.vercel', '.audit', '.audit-screenshots', '.screens', '.design-shots',
  '.playwright-cli', '.venture', '.founder-os', 'out', '.cache',
]);
const CODE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.vue', '.svelte']);
const MAX_BYTES = 400_000;

// Pattern → meaning. Each match becomes a cited finding.
const ANALYTICS = [
  [/posthog/i, 'PostHog'], [/segment|analytics\.track/i, 'Segment/analytics'],
  [/mixpanel/i, 'Mixpanel'], [/amplitude/i, 'Amplitude'],
  [/gtag\(|google-analytics|ga\(/i, 'Google Analytics'], [/plausible/i, 'Plausible'],
];
const FUNNEL = [
  [/\bsign[\s_-]?up\b|createUser|registerUser/i, 'signup'],
  [/\bsign[\s_-]?in\b|\blogin\b|authenticate/i, 'login/auth'],
  [/\bcheckout\b|createCheckout|stripe/i, 'checkout/payment'],
  [/\bonboard/i, 'onboarding'],
];
const ATTRIBUTION = [
  [/utm_|source_id|referr?er|\bref\b|\battribution\b/i, 'source/attribution'],
];

function walk(dir, files = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return files; }
  for (const e of entries) {
    if (e.name.startsWith('.') && e.name !== '.') {
      if (SKIP_DIRS.has(e.name)) continue;
    }
    if (SKIP_DIRS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, files);
    else if (CODE_EXT.has(path.extname(e.name))) files.push(full);
  }
  return files;
}

function scan(file, patterns, bucket) {
  let text;
  try {
    if (fs.statSync(file).size > MAX_BYTES) return;
    text = fs.readFileSync(file, 'utf8');
  } catch { return; }
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    for (const [re, label] of patterns) {
      if (re.test(lines[i])) {
        bucket.push({ label, file: path.relative(root, file), line: i + 1,
                      text: lines[i].trim().slice(0, 120) });
      }
    }
  }
}

function detectStack() {
  const findings = [];
  for (const f of ['package.json', 'turbo.json', 'firebase.json', 'vercel.json',
                   'next.config.js', 'vite.config.ts', 'svelte.config.js']) {
    if (fs.existsSync(path.join(root, f))) findings.push(f);
  }
  return findings;
}

const files = walk(root);
const analytics = [], funnel = [], attribution = [];
for (const f of files) {
  scan(f, ANALYTICS, analytics);
  scan(f, FUNNEL, funnel);
  scan(f, ATTRIBUTION, attribution);
}

const dedupLabels = (arr) => [...new Set(arr.map((x) => x.label))];

const report = {
  repo: root,
  stack: detectStack(),
  filesScanned: files.length,
  analytics: { wired: analytics.length > 0, providers: dedupLabels(analytics),
               citations: analytics.slice(0, 8) },
  funnelTouchpoints: { kinds: dedupLabels(funnel), citations: funnel.slice(0, 12) },
  attribution: { present: attribution.length > 0, citations: attribution.slice(0, 8) },
};

// The headline — the honest verdict, grounded in the evidence above.
const blind = !report.analytics.wired || !report.attribution.present;
report.headline = blind
  ? "BLIND — you can't tell where your users come from. " +
    (report.analytics.wired ? "Analytics is wired but " : "No analytics SDK found and ") +
    (report.attribution.present ? "attribution exists but isn't joined."
                                : "no source/attribution is captured.")
  : "Instrumented — analytics and attribution are both present (verify they're joined).";

console.log(JSON.stringify(report, null, 2));
console.error('\n' + report.headline + '\n');
