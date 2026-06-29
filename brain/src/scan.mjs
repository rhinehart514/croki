// Grounded repository analysis for GTM IDE.
//
// This scanner intentionally recognizes concrete calls and captured values,
// rather than searching for marketing words. Every conclusion carries a
// file-and-line citation, and anything the scanner cannot prove stays blind.

import fs from "node:fs";
import path from "node:path";

const SKIP_DIRS = new Set([
  "node_modules", ".git", ".next", "dist", "build", ".turbo", "coverage",
  ".vercel", ".audit", ".audit-screenshots", ".screens", ".design-shots",
  ".playwright-cli", ".venture", ".founder-os", "out", ".cache", "vendor",
  "__tests__", "__snapshots__", "test", "tests", "docs",
  ".claude",
]);
const CODE_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".vue", ".svelte"]);
const MAX_BYTES = 500_000;
const MAX_CITATIONS = 24;

const ANALYTICS_CALLS = [
  [/\bposthog\.(?:capture|identify|init)\s*\(/i, "PostHog"],
  [/\banalytics\.(?:track|page|identify|group)\s*\(/i, "Segment"],
  [/\bmixpanel\.(?:track|identify|init)\s*\(/i, "Mixpanel"],
  [/\bamplitude\.(?:track|identify|init)\s*\(/i, "Amplitude"],
  [/\b(?:gtag|ga)\s*\(/i, "Google Analytics"],
  [/\bplausible\s*\(/i, "Plausible"],
];

const ATTRIBUTION_CAPTURE = [
  [/\b(?:searchParams|url\.searchParams|params)\.get\(\s*["'](ref|source|source_id|utm_source|utm_campaign|utm_medium)["']\s*\)/i],
  [/\b(utm_source|utm_campaign|utm_medium|source_id|sourceId|referrer|eventRef)\b\s*[:=]/i],
];

const EVENT_CALL = /\b(recordDiscoveryEvent|analytics\.track|AnalyticsService\.track|posthog\.capture)\s*\(\s*["']([^"']+)["']/i;
const ATTRIBUTION_KEYS = new Set([
  "ref", "referrer", "source", "source_id", "sourceId", "eventRef",
  "utm_source", "utm_campaign", "utm_medium", "campaign", "channel",
]);

function walk(dir, files = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return files;
  }

  for (const entry of entries) {
    if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (CODE_EXT.has(path.extname(entry.name))) files.push(full);
  }
  return files;
}

function readSource(file) {
  try {
    if (fs.statSync(file).size > MAX_BYTES) return null;
    return fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

function citation(root, file, lineIndex, text, label) {
  return {
    label,
    file: path.relative(root, file),
    line: lineIndex + 1,
    text: text.trim().slice(0, 180),
  };
}

function stripLineComment(line) {
  let quote = null;
  let escaped = false;
  for (let i = 0; i < line.length - 1; i += 1) {
    const char = line[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      continue;
    }
    if (char === "/" && line[i + 1] === "/") return line.slice(0, i);
  }
  return line;
}

function matchOutsideString(line, pattern) {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const matcher = new RegExp(pattern.source, flags);
  let quote = null;
  let escaped = false;
  const inside = new Set();

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (escaped) {
      if (quote) inside.add(index);
      escaped = false;
      continue;
    }
    if (char === "\\") {
      if (quote) inside.add(index);
      escaped = true;
      continue;
    }
    if (quote) {
      inside.add(index);
      if (char === quote) quote = null;
    } else if (char === "'" || char === '"' || char === "`") {
      quote = char;
      inside.add(index);
    }
  }

  let match;
  while ((match = matcher.exec(line))) {
    if (!inside.has(match.index)) return match;
  }
  return null;
}

function callBlock(lines, start, maxLines = 60) {
  const selected = [];
  let parens = 0;
  let started = false;

  for (let i = start; i < Math.min(lines.length, start + maxLines); i += 1) {
    const clean = stripLineComment(lines[i]);
    selected.push(clean);
    for (const char of clean) {
      if (char === "(") {
        parens += 1;
        started = true;
      } else if (char === ")") {
        parens -= 1;
      }
    }
    if (started && parens <= 0) break;
  }
  return selected.join("\n");
}

function objectKeys(block) {
  const objectStart = block.indexOf("{");
  if (objectStart < 0) return [];
  const keys = [];
  const re = /(?:^|[,{]\s*)([A-Za-z_$][\w$]*)\s*(?=:|,|\})/gm;
  let match;
  while ((match = re.exec(block.slice(objectStart)))) keys.push(match[1]);
  return [...new Set(keys)];
}

function uniqueByLocation(findings) {
  const seen = new Set();
  return findings.filter((finding) => {
    const key = `${finding.file}:${finding.line}:${finding.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function titleFromEvent(eventName) {
  return eventName
    .split(/[_\-.]/)
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(" ");
}

function contextLabel(file) {
  const parts = file.split(path.sep);
  const meaningful = parts.find((part) => /join|signup|onboard|checkout|invite/i.test(part));
  return meaningful ? `${titleFromEvent(meaningful)} flow` : "Conversion flow";
}

export function scanRepo(inputRoot, options = {}) {
  const root = path.resolve(inputRoot);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw new Error(`Repository directory not found: ${root}`);
  }

  const winEventName = options.winEvent || "project_created";
  const files = walk(root);
  const analytics = [];
  const attribution = [];
  const events = [];

  for (const file of files) {
    const source = readSource(file);
    if (source === null) continue;
    const lines = source.split("\n");

    for (let index = 0; index < lines.length; index += 1) {
      const clean = stripLineComment(lines[index]);
      if (!clean.trim()) continue;

      for (const [pattern, provider] of ANALYTICS_CALLS) {
        if (matchOutsideString(clean, pattern)) {
          analytics.push(citation(root, file, index, lines[index], provider));
        }
      }

      for (const [pattern] of ATTRIBUTION_CAPTURE) {
        const match = matchOutsideString(clean, pattern);
        if (match) {
          attribution.push({
            ...citation(root, file, index, lines[index], match[1] || "source"),
            key: match[1] || "source",
          });
        }
      }

      const eventMatch = matchOutsideString(clean, EVENT_CALL);
      if (eventMatch) {
        const block = callBlock(lines, index);
        events.push({
          name: eventMatch[2],
          emitter: eventMatch[1],
          properties: objectKeys(block),
          citation: citation(root, file, index, lines[index], eventMatch[2]),
        });
      }
    }
  }

  const analyticsCitations = uniqueByLocation(analytics);
  const attributionCitations = uniqueByLocation(attribution);
  const winEvents = events.filter((event) => event.name === winEventName);
  const winCitations = winEvents.map((event) => event.citation);
  const winProperties = [...new Set(winEvents.flatMap((event) => event.properties))];
  const carriedAttribution = winProperties.filter((key) => ATTRIBUTION_KEYS.has(key));

  const attributionCaptured = attributionCitations.length > 0;
  const winFound = winEvents.length > 0;
  const trackingGap = attributionCaptured && winFound && carriedAttribution.length === 0;

  const stages = [];
  if (attributionCaptured) {
    const source = attributionCitations[0];
    stages.push({
      id: "source",
      label: "Attribution captured",
      state: "proven",
      description: `The repo captures “${source.key}” before the win event.`,
      citations: [source],
    });
    stages.push({
      id: "flow",
      label: contextLabel(source.file),
      state: trackingGap ? "gap" : "inferred",
      description: trackingGap
        ? "The source exists in the conversion flow, but is not attached to the win event."
        : "The source capture and win event exist; the exact handoff still needs verification.",
      citations: [source, ...winCitations.slice(0, 1)],
    });
  } else {
    stages.push({
      id: "source",
      label: "Acquisition source",
      state: "blind",
      description: "No concrete source or campaign capture was found.",
      citations: [],
    });
  }

  stages.push({
    id: "win",
    label: titleFromEvent(winEventName),
    state: winFound ? "proven" : "blind",
    description: winFound
      ? `The win event is emitted with: ${winProperties.join(", ") || "no explicit properties"}.`
      : `No concrete emission of “${winEventName}” was found.`,
    citations: winCitations.slice(0, 3),
  });

  const gaps = [];
  if (trackingGap) {
    gaps.push({
      id: "attribution-not-carried",
      title: `Source is missing from ${winEventName}`,
      severity: "high",
      status: "proven",
      summary: `The repo captures attribution, but “${winEventName}” is emitted without a source, referrer, campaign, or channel property.`,
      recommendation: `Carry the captured source into the creation path and include it on “${winEventName}”.`,
      citations: [attributionCitations[0], ...winCitations.slice(0, 2)],
    });
  } else if (!attributionCaptured) {
    gaps.push({
      id: "attribution-not-captured",
      title: "Acquisition source is not captured",
      severity: "high",
      status: "blind",
      summary: "No concrete source or campaign capture was found in production code.",
      recommendation: "Capture a durable source identifier at the first meaningful entry point.",
      citations: [],
    });
  } else if (!winFound) {
    gaps.push({
      id: "win-event-not-found",
      title: `Win event “${winEventName}” is not proven`,
      severity: "high",
      status: "blind",
      summary: "The requested win event could not be confirmed in production code.",
      recommendation: "Emit one canonical win event at the point the outcome is committed.",
      citations: [],
    });
  }

  const providers = [...new Set(analyticsCitations.map((item) => item.label))];
  const headline = trackingGap
    ? `Tracking gap proven: attribution is captured but missing from ${winEventName}.`
    : !winFound
      ? `Blind: ${winEventName} could not be confirmed.`
      : !attributionCaptured
        ? `Blind: ${winEventName} exists, but acquisition source is not captured.`
        : `Instrumented: ${winEventName} carries ${carriedAttribution.join(", ")}.`;

  return {
    schemaVersion: 1,
    repo: root,
    scannedAt: new Date().toISOString(),
    filesScanned: files.length,
    stack: [
      "package.json", "turbo.json", "firebase.json", "vercel.json",
      "next.config.js", "next.config.mjs", "vite.config.ts", "svelte.config.js",
    ].filter((file) => fs.existsSync(path.join(root, file))),
    headline,
    analytics: {
      wired: analyticsCitations.length > 0,
      providers,
      citations: analyticsCitations.slice(0, MAX_CITATIONS),
    },
    attribution: {
      captured: attributionCaptured,
      keys: [...new Set(attributionCitations.map((item) => item.key))],
      citations: attributionCitations.slice(0, MAX_CITATIONS),
    },
    winEvent: {
      name: winEventName,
      found: winFound,
      properties: winProperties,
      attributionProperties: carriedAttribution,
      citations: winCitations.slice(0, MAX_CITATIONS),
    },
    funnel: {
      stages,
      edges: stages.slice(0, -1).map((stage, index) => ({
        id: `${stage.id}-${stages[index + 1].id}`,
        source: stage.id,
        target: stages[index + 1].id,
        state: stages[index + 1].state === "gap" ? "gap" : "proven",
      })),
    },
    gaps,
  };
}

export function headline(report) {
  return report.headline;
}
