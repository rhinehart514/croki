#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const SKILL_DIRECTORY = resolve(SCRIPT_DIRECTORY, "..");
const REPOSITORY_ROOT = resolve(SKILL_DIRECTORY, "../../..");
const DEFAULT_STATE_DIRECTORY = resolve(REPOSITORY_ROOT, ".gtm-expansion");
const DEFAULT_POLICY_FILE = resolve(SKILL_DIRECTORY, "config/triggers.json");

function parseArguments(values) {
  const flags = {};
  const positional = [];
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) {
      positional.push(value);
      continue;
    }
    const key = value.slice(2);
    const next = values[index + 1];
    if (next === undefined || next.startsWith("--")) {
      flags[key] = true;
      continue;
    }
    flags[key] = next;
    index += 1;
  }
  return { flags, positional };
}

function required(flags, key) {
  const value = flags[key];
  if (value === undefined || value === true || String(value).trim() === "") {
    throw new Error("--" + key + " is required.");
  }
  return String(value);
}

function stateDirectory(flags) {
  const configured = flags.state;
  return configured && configured !== true
    ? resolve(process.cwd(), String(configured))
    : DEFAULT_STATE_DIRECTORY;
}

function ensureIsoDate(value, label) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    throw new Error(label + " must be an ISO date.");
  }
  return date.toISOString();
}

function boundedJson(value, label, maxLength = 12000) {
  const encoded = JSON.stringify(value ?? {});
  if (encoded.length > maxLength) {
    throw new Error(label + " exceeds " + maxLength + " encoded characters.");
  }
  return encoded;
}

function stableHash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function readNdjson(file) {
  const path = resolve(process.cwd(), file);
  const lines = readFileSync(path, "utf8").split(/\r?\n/u);
  const rows = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line || line.startsWith("//")) {
      continue;
    }
    try {
      rows.push(JSON.parse(line));
    } catch (error) {
      throw new Error(path + ":" + (index + 1) + " is invalid JSON: " + error.message);
    }
  }
  return rows;
}

function loadPolicy(flags) {
  const file =
    flags.policy && flags.policy !== true
      ? resolve(process.cwd(), String(flags.policy))
      : DEFAULT_POLICY_FILE;
  const policy = JSON.parse(readFileSync(file, "utf8"));
  if (policy.schema_version !== 1 || typeof policy.policy_version !== "string") {
    throw new Error("Unsupported trigger policy at " + file + ".");
  }
  if (!Array.isArray(policy.rules)) {
    throw new Error("Trigger policy rules must be an array.");
  }
  return { file, policy };
}

function openDatabase(directory) {
  mkdirSync(directory, { recursive: true });
  const databaseFile = resolve(directory, "state.sqlite");
  const database = new DatabaseSync(databaseFile);
  database.exec(
    [
      "PRAGMA foreign_keys = ON;",
      "PRAGMA journal_mode = WAL;",
      "CREATE TABLE IF NOT EXISTS schema_migrations (",
      "  version INTEGER PRIMARY KEY,",
      "  applied_at TEXT NOT NULL",
      ");",
      "CREATE TABLE IF NOT EXISTS runs (",
      "  run_id TEXT PRIMARY KEY,",
      "  command TEXT NOT NULL,",
      "  started_at TEXT NOT NULL,",
      "  completed_at TEXT,",
      "  status TEXT NOT NULL,",
      "  summary_json TEXT",
      ");",
      "CREATE TABLE IF NOT EXISTS source_events (",
      "  event_id TEXT PRIMARY KEY,",
      "  occurred_at TEXT NOT NULL,",
      "  source TEXT NOT NULL,",
      "  account_id TEXT NOT NULL,",
      "  event_name TEXT NOT NULL,",
      "  object_id TEXT,",
      "  properties_json TEXT NOT NULL,",
      "  source_hash TEXT NOT NULL,",
      "  ingested_at TEXT NOT NULL",
      ");",
      "CREATE INDEX IF NOT EXISTS source_events_account_time ON source_events(account_id, occurred_at);",
      "CREATE INDEX IF NOT EXISTS source_events_name_time ON source_events(event_name, occurred_at);",
      "CREATE TABLE IF NOT EXISTS accounts (",
      "  account_id TEXT PRIMARY KEY,",
      "  company_name TEXT,",
      "  contact_ref TEXT,",
      "  relationship TEXT,",
      "  metadata_json TEXT NOT NULL,",
      "  updated_at TEXT NOT NULL",
      ");",
      "CREATE TABLE IF NOT EXISTS opportunities (",
      "  opportunity_id TEXT PRIMARY KEY,",
      "  account_id TEXT NOT NULL,",
      "  rule_id TEXT NOT NULL,",
      "  status TEXT NOT NULL,",
      "  score INTEGER NOT NULL,",
      "  hypothesis TEXT NOT NULL,",
      "  provisional_offer TEXT NOT NULL,",
      "  evidence_standard TEXT NOT NULL,",
      "  policy_version TEXT NOT NULL,",
      "  first_seen_at TEXT NOT NULL,",
      "  last_seen_at TEXT NOT NULL,",
      "  latest_evidence_at TEXT NOT NULL,",
      "  updated_at TEXT NOT NULL,",
      "  UNIQUE(account_id, rule_id)",
      ");",
      "CREATE TABLE IF NOT EXISTS opportunity_evidence (",
      "  opportunity_id TEXT NOT NULL REFERENCES opportunities(opportunity_id),",
      "  event_id TEXT NOT NULL REFERENCES source_events(event_id),",
      "  PRIMARY KEY(opportunity_id, event_id)",
      ");",
      "CREATE TABLE IF NOT EXISTS decisions (",
      "  decision_id TEXT PRIMARY KEY,",
      "  opportunity_id TEXT NOT NULL REFERENCES opportunities(opportunity_id),",
      "  verdict TEXT NOT NULL,",
      "  reason TEXT NOT NULL,",
      "  decided_by TEXT NOT NULL,",
      "  decided_at TEXT NOT NULL",
      ");",
      "CREATE TABLE IF NOT EXISTS action_drafts (",
      "  action_id TEXT PRIMARY KEY,",
      "  opportunity_id TEXT NOT NULL REFERENCES opportunities(opportunity_id),",
      "  channel TEXT NOT NULL,",
      "  recipient_ref TEXT NOT NULL,",
      "  content TEXT NOT NULL,",
      "  evidence_ids_json TEXT NOT NULL,",
      "  created_by TEXT NOT NULL,",
      "  created_at TEXT NOT NULL",
      ");",
      "CREATE TABLE IF NOT EXISTS outcomes (",
      "  outcome_id TEXT PRIMARY KEY,",
      "  opportunity_id TEXT NOT NULL REFERENCES opportunities(opportunity_id),",
      "  outcome_type TEXT NOT NULL,",
      "  detail TEXT NOT NULL,",
      "  occurred_at TEXT NOT NULL,",
      "  recorded_at TEXT NOT NULL",
      ");",
      "INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (1, datetime('now'));",
    ].join("\n"),
  );
  return { database, databaseFile };
}

function runMutation(database, command, operation) {
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  database
    .prepare("INSERT INTO runs(run_id, command, started_at, status) VALUES (?, ?, ?, 'running')")
    .run(runId, command, startedAt);
  database.exec("BEGIN IMMEDIATE");
  try {
    const summary = operation();
    database.exec("COMMIT");
    database
      .prepare(
        "UPDATE runs SET completed_at = ?, status = 'completed', summary_json = ? WHERE run_id = ?",
      )
      .run(new Date().toISOString(), boundedJson(summary, "run summary"), runId);
    return { run_id: runId, ...summary };
  } catch (error) {
    database.exec("ROLLBACK");
    database
      .prepare("UPDATE runs SET completed_at = ?, status = 'failed' WHERE run_id = ?")
      .run(new Date().toISOString(), runId);
    throw error;
  }
}

function normalizeUsageRow(row) {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throw new Error("Every usage row must be an object.");
  }
  for (const key of ["event_id", "account_id", "event_name"]) {
    if (typeof row[key] !== "string" || row[key].trim() === "") {
      throw new Error("Usage row " + key + " must be a non-empty string.");
    }
  }
  const properties =
    row.properties && typeof row.properties === "object" && !Array.isArray(row.properties)
      ? row.properties
      : {};
  return {
    event_id: row.event_id.trim(),
    occurred_at: ensureIsoDate(row.occurred_at, "occurred_at"),
    source: typeof row.source === "string" && row.source.trim() ? row.source.trim() : "normalized",
    account_id: row.account_id.trim(),
    event_name: row.event_name.trim(),
    object_id:
      typeof row.object_id === "string" && row.object_id.trim() ? row.object_id.trim() : null,
    properties,
  };
}

function insertUsageRows(database, rows, command) {
  const statement = database.prepare(
    [
      "INSERT OR IGNORE INTO source_events(",
      "event_id, occurred_at, source, account_id, event_name, object_id, properties_json, source_hash, ingested_at",
      ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ].join(" "),
  );
  return runMutation(database, command, () => {
    let inserted = 0;
    let duplicates = 0;
    for (const sourceRow of rows) {
      const row = normalizeUsageRow(sourceRow);
      const result = statement.run(
        row.event_id,
        row.occurred_at,
        row.source,
        row.account_id,
        row.event_name,
        row.object_id,
        boundedJson(row.properties, "event properties"),
        stableHash(sourceRow),
        new Date().toISOString(),
      );
      if (Number(result.changes) === 1) {
        inserted += 1;
      } else {
        duplicates += 1;
      }
    }
    return { inserted, duplicates, total: rows.length };
  });
}

function nestedValue(object, path) {
  let value = object;
  for (const segment of path) {
    if (!value || typeof value !== "object") {
      return undefined;
    }
    value = value[segment];
  }
  return value;
}

function mapAxiomSpan(row) {
  const custom =
    row.customAttributes && typeof row.customAttributes === "object"
      ? row.customAttributes
      : row.custom && typeof row.custom === "object"
        ? row.custom
        : {};
  const accountId =
    row.userId ?? row.user_id ?? custom["user.id"] ?? nestedValue(custom, ["user", "id"]);
  if (typeof accountId !== "string" || !accountId.trim()) {
    return { skipped: "unresolved_account" };
  }
  const method = String(row.requestMethod ?? row.method ?? "").toUpperCase();
  const requestPath = String(row.path ?? row.endpoint ?? "");
  const statusCode = Number(row.statusCode ?? row.status_code ?? 0);
  const errorType = String(
    row.errorType ??
      custom["error.type"] ??
      nestedValue(custom, ["error", "type"]) ??
      custom["relay.error.outbound_tag"] ??
      nestedValue(custom, ["relay", "error", "outbound_tag"]) ??
      "",
  );
  const environmentMatch = requestPath.match(/\/v1\/environments\/([^/]+)/u);
  const environmentId =
    row.environmentId ??
    custom["relay.environment_id"] ??
    nestedValue(custom, ["relay", "environment_id"]) ??
    environmentMatch?.[1] ??
    null;
  const successful = statusCode >= 200 && statusCode < 400;
  let eventName = null;
  if (/ManagedTunnelLimitExceeded|RelayEnvironmentLinkLimitExceededError/u.test(errorType)) {
    eventName = "managed_tunnel.limit_reached";
  } else if (successful && method === "POST" && requestPath === "/v1/mobile/devices") {
    eventName = "mobile.device.registered";
  } else if (successful && method === "POST" && requestPath === "/v1/mobile/live-activities") {
    eventName = "mobile.live_activity.registered";
  } else if (successful && method === "GET" && requestPath === "/v1/mobile/agent-activity") {
    eventName = "mobile.agent_activity.read";
  } else if (successful && method === "GET" && requestPath === "/v1/environments") {
    eventName = "environment.listed";
  } else if (successful && method === "POST" && requestPath === "/v1/client/environment-links") {
    eventName = "environment.linked";
  } else if (
    successful &&
    method === "POST" &&
    /^\/v1\/environments\/[^/]+\/connect$/u.test(requestPath)
  ) {
    eventName = "environment.connected";
  } else if (
    successful &&
    method === "POST" &&
    /^\/v1\/environments\/[^/]+\/status$/u.test(requestPath)
  ) {
    eventName = "environment.status_checked";
  }
  if (!eventName) {
    return { skipped: "unmapped_span" };
  }
  const occurredAt = row._time ?? row.occurred_at ?? row.timestamp;
  const stableId =
    row.span_id ??
    row.spanId ??
    (row.trace_id && row.name ? row.trace_id + ":" + row.name + ":" + occurredAt : null) ??
    stableHash(row);
  return {
    event_id: "axiom:" + stableId,
    occurred_at: occurredAt,
    source: "axiom",
    account_id: accountId,
    event_name: eventName,
    object_id: typeof environmentId === "string" && environmentId ? environmentId : null,
    properties: {
      path: requestPath,
      method,
      status_code: statusCode,
      endpoint: row.endpoint ?? null,
      environment_id: typeof environmentId === "string" && environmentId ? environmentId : null,
      error_type: errorType || null,
      source_name: row.name ?? null,
    },
  };
}

function metadataHasForbiddenKey(value) {
  if (!value || typeof value !== "object") {
    return false;
  }
  for (const [key, child] of Object.entries(value)) {
    if (/email|phone|token|secret|password|prompt|source.?code|thread.?title/iu.test(key)) {
      return true;
    }
    if (metadataHasForbiddenKey(child)) {
      return true;
    }
  }
  return false;
}

function importAccounts(database, rows) {
  const statement = database.prepare(
    [
      "INSERT INTO accounts(account_id, company_name, contact_ref, relationship, metadata_json, updated_at)",
      "VALUES (?, ?, ?, ?, ?, ?)",
      "ON CONFLICT(account_id) DO UPDATE SET",
      "company_name = excluded.company_name, contact_ref = excluded.contact_ref,",
      "relationship = excluded.relationship, metadata_json = excluded.metadata_json,",
      "updated_at = excluded.updated_at",
    ].join(" "),
  );
  return runMutation(database, "ingest-accounts", () => {
    let upserted = 0;
    for (const row of rows) {
      if (!row || typeof row.account_id !== "string" || !row.account_id.trim()) {
        throw new Error("Account row account_id must be a non-empty string.");
      }
      if (typeof row.contact_ref === "string" && row.contact_ref.includes("@")) {
        throw new Error("contact_ref must be an opaque source reference, not an email address.");
      }
      const metadata =
        row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
          ? row.metadata
          : {};
      if (metadataHasForbiddenKey(metadata)) {
        throw new Error("Account metadata contains a disallowed sensitive field.");
      }
      statement.run(
        row.account_id.trim(),
        typeof row.company_name === "string" && row.company_name.trim()
          ? row.company_name.trim()
          : null,
        typeof row.contact_ref === "string" && row.contact_ref.trim()
          ? row.contact_ref.trim()
          : null,
        typeof row.relationship === "string" && row.relationship.trim()
          ? row.relationship.trim()
          : null,
        boundedJson(metadata, "account metadata"),
        new Date().toISOString(),
      );
      upserted += 1;
    }
    return { upserted, total: rows.length };
  });
}

function opportunityId(accountId, ruleId) {
  return (
    "opp_" +
    createHash("sha256")
      .update(accountId + "\0" + ruleId)
      .digest("hex")
      .slice(0, 20)
  );
}

function evaluate(database, policy, nowValue) {
  const now = ensureIsoDate(nowValue ?? new Date().toISOString(), "now");
  const accountRows = database
    .prepare("SELECT DISTINCT account_id FROM source_events ORDER BY account_id")
    .all();
  const existingRows = database.prepare("SELECT opportunity_id, status FROM opportunities").all();
  const existingStatus = new Map(existingRows.map((row) => [row.opportunity_id, row.status]));
  const upsert = database.prepare(
    [
      "INSERT INTO opportunities(",
      "opportunity_id, account_id, rule_id, status, score, hypothesis, provisional_offer,",
      "evidence_standard, policy_version, first_seen_at, last_seen_at, latest_evidence_at, updated_at",
      ") VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      "ON CONFLICT(account_id, rule_id) DO UPDATE SET",
      "score = excluded.score, hypothesis = excluded.hypothesis,",
      "provisional_offer = excluded.provisional_offer, evidence_standard = excluded.evidence_standard,",
      "policy_version = excluded.policy_version, last_seen_at = excluded.last_seen_at,",
      "latest_evidence_at = excluded.latest_evidence_at, updated_at = excluded.updated_at,",
      "status = CASE WHEN opportunities.status = 'stale' THEN 'candidate' ELSE opportunities.status END",
    ].join(" "),
  );
  return runMutation(database, "evaluate", () => {
    const matched = new Set();
    let nominated = 0;
    for (const accountRow of accountRows) {
      for (const rule of policy.rules.filter((item) => item.status === "active")) {
        const windowStart = new Date(
          new Date(now).valueOf() - Number(rule.window_days) * 24 * 60 * 60 * 1000,
        ).toISOString();
        const placeholders = rule.event_names.map(() => "?").join(", ");
        const events = database
          .prepare(
            [
              "SELECT event_id, occurred_at, event_name, object_id, properties_json",
              "FROM source_events",
              "WHERE account_id = ? AND occurred_at >= ? AND occurred_at <= ?",
              "AND event_name IN (" + placeholders + ")",
              "ORDER BY occurred_at ASC, event_id ASC",
            ].join(" "),
          )
          .all(accountRow.account_id, windowStart, now, ...rule.event_names);
        const names = new Set(events.map((event) => event.event_name));
        const requiredNames = rule.required_event_names ?? [];
        const hasRequiredNames = requiredNames.every((name) => names.has(name));
        const distinctObjects = new Set(
          events.map((event) => event.object_id).filter((value) => value !== null && value !== ""),
        );
        const qualifies =
          hasRequiredNames &&
          events.length >= Number(rule.min_occurrences) &&
          distinctObjects.size >= Number(rule.min_distinct_objects);
        if (!qualifies) {
          continue;
        }
        const id = opportunityId(accountRow.account_id, rule.id);
        matched.add(id);
        nominated += 1;
        const latestEvidenceAt = events.at(-1).occurred_at;
        const priorStatus = existingStatus.get(id);
        upsert.run(
          id,
          accountRow.account_id,
          rule.id,
          priorStatus && priorStatus !== "stale" ? priorStatus : "candidate",
          Number(rule.score),
          rule.hypothesis,
          rule.provisional_offer,
          rule.evidence_standard,
          policy.policy_version,
          now,
          now,
          latestEvidenceAt,
          now,
        );
        database.prepare("DELETE FROM opportunity_evidence WHERE opportunity_id = ?").run(id);
        const attach = database.prepare(
          "INSERT INTO opportunity_evidence(opportunity_id, event_id) VALUES (?, ?)",
        );
        for (const event of events) {
          attach.run(id, event.event_id);
        }
      }
    }
    let markedStale = 0;
    for (const existing of existingRows) {
      if (
        !matched.has(existing.opportunity_id) &&
        ["candidate", "hold"].includes(existing.status)
      ) {
        database
          .prepare(
            "UPDATE opportunities SET status = 'stale', updated_at = ? WHERE opportunity_id = ?",
          )
          .run(now, existing.opportunity_id);
        markedStale += 1;
      }
    }
    return {
      evaluated_at: now,
      policy_version: policy.policy_version,
      accounts_evaluated: accountRows.length,
      opportunities_nominated: nominated,
      opportunities_marked_stale: markedStale,
    };
  });
}

function evidenceFor(database, opportunityIdValue) {
  return database
    .prepare(
      [
        "SELECT e.event_id, e.occurred_at, e.source, e.event_name, e.object_id, e.properties_json",
        "FROM opportunity_evidence oe",
        "JOIN source_events e ON e.event_id = oe.event_id",
        "WHERE oe.opportunity_id = ?",
        "ORDER BY e.occurred_at ASC, e.event_id ASC",
      ].join(" "),
    )
    .all(opportunityIdValue)
    .map((row) => ({
      event_id: row.event_id,
      occurred_at: row.occurred_at,
      source: row.source,
      event_name: row.event_name,
      object_id: row.object_id,
      properties: JSON.parse(row.properties_json),
    }));
}

function opportunityPacket(database, row, policy) {
  const blockers = [];
  if (row.status === "candidate") {
    blockers.push("human advancement decision");
  }
  if (!row.company_name) {
    blockers.push("company identity unresolved");
  }
  if (!row.contact_ref) {
    blockers.push("opaque contact reference missing");
  }
  if (policy.offer_status !== "confirmed") {
    blockers.push("Croki expansion offer is still open");
  }
  blockers.push("authorized delivery adapter is absent");
  return {
    opportunity_id: row.opportunity_id,
    status: row.status,
    score: row.score,
    account: {
      account_id: row.account_id,
      company_name: row.company_name,
      contact_ref: row.contact_ref,
      relationship: row.relationship,
    },
    trigger: {
      rule_id: row.rule_id,
      hypothesis: row.hypothesis,
      evidence_standard: row.evidence_standard,
      latest_evidence_at: row.latest_evidence_at,
      policy_version: row.policy_version,
    },
    provisional_offer: row.provisional_offer,
    evidence: evidenceFor(database, row.opportunity_id),
    readiness: {
      offer_status: policy.offer_status,
      identity_resolved: Boolean(row.company_name && row.contact_ref),
      delivery_implemented: false,
      ready_for_draft:
        row.status === "advanced" &&
        Boolean(row.contact_ref) &&
        policy.offer_status === "confirmed",
    },
    blocked_on: blockers,
  };
}

function queue(database, policy, includeAll) {
  const where = includeAll ? "" : "WHERE o.status NOT IN ('dismissed', 'stale')";
  const rows = database
    .prepare(
      [
        "SELECT o.*, a.company_name, a.contact_ref, a.relationship",
        "FROM opportunities o",
        "LEFT JOIN accounts a ON a.account_id = o.account_id",
        where,
        "ORDER BY o.score DESC, o.latest_evidence_at DESC, o.opportunity_id ASC",
      ].join(" "),
    )
    .all();
  return rows.map((row) => opportunityPacket(database, row, policy));
}

function markdownQueue(packets) {
  if (packets.length === 0) {
    return "# Croki expansion queue\n\nNo reviewable opportunities.\n";
  }
  const lines = ["# Croki expansion queue", ""];
  for (const packet of packets) {
    lines.push(
      "## " + (packet.account.company_name ?? packet.account.account_id),
      "",
      "- Opportunity: " + packet.opportunity_id,
      "- Status: " + packet.status,
      "- Score: " + packet.score,
      "- Trigger: " + packet.trigger.rule_id,
      "- Hypothesis: " + packet.trigger.hypothesis,
      "- Latest evidence: " + packet.trigger.latest_evidence_at,
      "- Proposed intervention: " + packet.provisional_offer,
      "- Blocked on: " + packet.blocked_on.join("; "),
      "",
      "Evidence:",
      "",
    );
    for (const event of packet.evidence) {
      lines.push(
        "- " +
          event.occurred_at +
          " — " +
          event.event_name +
          " — " +
          event.event_id +
          (event.object_id ? " — " + event.object_id : ""),
      );
    }
    lines.push("");
  }
  return lines.join("\n");
}

function decide(database, flags) {
  const id = required(flags, "id");
  const verdict = required(flags, "verdict");
  const reason = required(flags, "reason");
  const decidedBy = required(flags, "by");
  const statusByVerdict = {
    advance: "advanced",
    hold: "hold",
    dismiss: "dismissed",
  };
  if (!statusByVerdict[verdict]) {
    throw new Error("--verdict must be advance, hold, or dismiss.");
  }
  if (reason.trim().length < 10) {
    throw new Error("--reason must preserve a meaningful decision rationale.");
  }
  return runMutation(database, "decide", () => {
    const opportunity = database
      .prepare("SELECT opportunity_id FROM opportunities WHERE opportunity_id = ?")
      .get(id);
    if (!opportunity) {
      throw new Error("Opportunity not found: " + id);
    }
    const decidedAt = new Date().toISOString();
    database
      .prepare("UPDATE opportunities SET status = ?, updated_at = ? WHERE opportunity_id = ?")
      .run(statusByVerdict[verdict], decidedAt, id);
    const decisionId = randomUUID();
    database
      .prepare(
        "INSERT INTO decisions(decision_id, opportunity_id, verdict, reason, decided_by, decided_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(decisionId, id, verdict, reason.trim(), decidedBy.trim(), decidedAt);
    return {
      decision_id: decisionId,
      opportunity_id: id,
      status: statusByVerdict[verdict],
    };
  });
}

function prepareAction(database, flags, policy) {
  const id = required(flags, "id");
  const channel = required(flags, "channel");
  const contentFile = resolve(process.cwd(), required(flags, "content-file"));
  const createdBy = required(flags, "by");
  const evidenceIds = required(flags, "evidence")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (policy.offer_status !== "confirmed") {
    throw new Error(
      "The Croki expansion offer is open. Record Jacob's consequential choice in the policy before preparing action.",
    );
  }
  if (!existsSync(contentFile)) {
    throw new Error("Content file not found: " + contentFile);
  }
  const content = readFileSync(contentFile, "utf8").trim();
  if (!content || content.length > 20000) {
    throw new Error("Draft content must contain 1 to 20000 characters.");
  }
  if (evidenceIds.length === 0) {
    throw new Error("At least one evidence ID is required.");
  }
  return runMutation(database, "prepare-action", () => {
    const opportunity = database
      .prepare(
        [
          "SELECT o.opportunity_id, o.status, a.contact_ref",
          "FROM opportunities o LEFT JOIN accounts a ON a.account_id = o.account_id",
          "WHERE o.opportunity_id = ?",
        ].join(" "),
      )
      .get(id);
    if (!opportunity) {
      throw new Error("Opportunity not found: " + id);
    }
    if (opportunity.status !== "advanced") {
      throw new Error("Opportunity must be explicitly advanced before action preparation.");
    }
    const recipient =
      flags.recipient && flags.recipient !== true
        ? String(flags.recipient)
        : opportunity.contact_ref;
    if (!recipient) {
      throw new Error("An opaque contact reference is required.");
    }
    if (recipient.includes("@")) {
      throw new Error("Recipient must be an opaque source reference, not an email address.");
    }
    const attached = new Set(
      database
        .prepare("SELECT event_id FROM opportunity_evidence WHERE opportunity_id = ?")
        .all(id)
        .map((row) => row.event_id),
    );
    const invalidEvidence = evidenceIds.filter((eventId) => !attached.has(eventId));
    if (invalidEvidence.length > 0) {
      throw new Error(
        "Draft claims reference evidence outside the opportunity: " + invalidEvidence.join(", "),
      );
    }
    const actionId = randomUUID();
    const createdAt = new Date().toISOString();
    database
      .prepare(
        [
          "INSERT INTO action_drafts(",
          "action_id, opportunity_id, channel, recipient_ref, content, evidence_ids_json, created_by, created_at",
          ") VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        ].join(" "),
      )
      .run(
        actionId,
        id,
        channel,
        recipient,
        content,
        boundedJson(evidenceIds, "evidence IDs"),
        createdBy,
        createdAt,
      );
    database
      .prepare(
        "UPDATE opportunities SET status = 'action-drafted', updated_at = ? WHERE opportunity_id = ?",
      )
      .run(createdAt, id);
    return {
      action_id: actionId,
      opportunity_id: id,
      status: "action-drafted",
      delivery_implemented: false,
    };
  });
}

function recordOutcome(database, flags) {
  const id = required(flags, "id");
  const outcomeType = required(flags, "type");
  const detail = required(flags, "detail");
  const occurredAt = ensureIsoDate(required(flags, "occurred-at"), "occurred-at");
  return runMutation(database, "record-outcome", () => {
    const opportunity = database
      .prepare("SELECT opportunity_id FROM opportunities WHERE opportunity_id = ?")
      .get(id);
    if (!opportunity) {
      throw new Error("Opportunity not found: " + id);
    }
    const outcomeId = randomUUID();
    const recordedAt = new Date().toISOString();
    database
      .prepare(
        "INSERT INTO outcomes(outcome_id, opportunity_id, outcome_type, detail, occurred_at, recorded_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(outcomeId, id, outcomeType, detail.trim(), occurredAt, recordedAt);
    database
      .prepare(
        "UPDATE opportunities SET status = 'outcome-observed', updated_at = ? WHERE opportunity_id = ?",
      )
      .run(recordedAt, id);
    return { outcome_id: outcomeId, opportunity_id: id, status: "outcome-observed" };
  });
}

function showOpportunity(database, id, policy) {
  const row = database
    .prepare(
      [
        "SELECT o.*, a.company_name, a.contact_ref, a.relationship",
        "FROM opportunities o LEFT JOIN accounts a ON a.account_id = o.account_id",
        "WHERE o.opportunity_id = ?",
      ].join(" "),
    )
    .get(id);
  if (!row) {
    throw new Error("Opportunity not found: " + id);
  }
  return {
    ...opportunityPacket(database, row, policy),
    decisions: database
      .prepare("SELECT * FROM decisions WHERE opportunity_id = ? ORDER BY decided_at ASC")
      .all(id),
    action_drafts: database
      .prepare(
        "SELECT action_id, channel, recipient_ref, evidence_ids_json, created_by, created_at FROM action_drafts WHERE opportunity_id = ? ORDER BY created_at ASC",
      )
      .all(id)
      .map((draft) => ({
        ...draft,
        evidence_ids: JSON.parse(draft.evidence_ids_json),
        evidence_ids_json: undefined,
      })),
    outcomes: database
      .prepare("SELECT * FROM outcomes WHERE opportunity_id = ? ORDER BY occurred_at ASC")
      .all(id),
  };
}

function status(database, databaseFile, policy) {
  const count = (table) =>
    Number(database.prepare("SELECT COUNT(*) AS count FROM " + table).get().count);
  const opportunities = database
    .prepare("SELECT status, COUNT(*) AS count FROM opportunities GROUP BY status ORDER BY status")
    .all()
    .map((row) => ({ status: row.status, count: Number(row.count) }));
  return {
    state_file: databaseFile,
    policy_version: policy.policy_version,
    offer_status: policy.offer_status,
    outbound_mode: policy.outbound_mode,
    counts: {
      source_events: count("source_events"),
      accounts: count("accounts"),
      opportunities,
      action_drafts: count("action_drafts"),
      outcomes: count("outcomes"),
    },
    capabilities: {
      normalized_import: true,
      axiom_export_import: true,
      durable_recovery: true,
      action_drafting: true,
      production_query: false,
      identity_lookup: false,
      crm_write: false,
      delivery: false,
    },
    next_boundary:
      policy.offer_status === "confirmed"
        ? "Connect authorized real sources before treating fixture behavior as an opportunity."
        : "Jacob must choose what expansion means for free, open-source Croki.",
  };
}

function help() {
  return [
    "Croki expansion operator",
    "",
    "Commands:",
    "  init [--state DIR]",
    "  status [--state DIR] [--policy FILE]",
    "  ingest-usage --input FILE [--state DIR]",
    "  ingest-axiom --input FILE [--state DIR]",
    "  ingest-accounts --input FILE [--state DIR]",
    "  evaluate [--now ISO] [--state DIR] [--policy FILE]",
    "  queue [--format json|markdown] [--all] [--state DIR] [--policy FILE]",
    "  show --id ID [--state DIR] [--policy FILE]",
    "  decide --id ID --verdict advance|hold|dismiss --reason TEXT --by PERSON",
    "  prepare-action --id ID --channel NAME --content-file FILE --evidence ID,ID --by PERSON",
    "  record-outcome --id ID --type TYPE --detail TEXT --occurred-at ISO",
    "",
    "There is intentionally no delivery command.",
  ].join("\n");
}

function main() {
  const { positional, flags } = parseArguments(process.argv.slice(2));
  const command = positional[0] ?? "help";
  if (command === "help" || flags.help) {
    process.stdout.write(help() + "\n");
    return;
  }
  const directory = stateDirectory(flags);
  const { database, databaseFile } = openDatabase(directory);
  try {
    if (command === "init") {
      process.stdout.write(
        JSON.stringify({ state_file: databaseFile, initialized: true }, null, 2) + "\n",
      );
      return;
    }
    if (command === "ingest-usage") {
      const result = insertUsageRows(
        database,
        readNdjson(required(flags, "input")),
        "ingest-usage",
      );
      process.stdout.write(JSON.stringify(result, null, 2) + "\n");
      return;
    }
    if (command === "ingest-axiom") {
      const rows = readNdjson(required(flags, "input"));
      const normalized = [];
      const skipped = { unresolved_account: 0, unmapped_span: 0 };
      for (const row of rows) {
        const mapped = mapAxiomSpan(row);
        if (mapped.skipped) {
          skipped[mapped.skipped] += 1;
        } else {
          normalized.push(mapped);
        }
      }
      const result = insertUsageRows(database, normalized, "ingest-axiom");
      process.stdout.write(JSON.stringify({ ...result, skipped }, null, 2) + "\n");
      return;
    }
    if (command === "ingest-accounts") {
      const result = importAccounts(database, readNdjson(required(flags, "input")));
      process.stdout.write(JSON.stringify(result, null, 2) + "\n");
      return;
    }
    const { policy } = loadPolicy(flags);
    if (command === "status") {
      process.stdout.write(JSON.stringify(status(database, databaseFile, policy), null, 2) + "\n");
      return;
    }
    if (command === "evaluate") {
      const result = evaluate(
        database,
        policy,
        flags.now && flags.now !== true ? String(flags.now) : undefined,
      );
      process.stdout.write(JSON.stringify(result, null, 2) + "\n");
      return;
    }
    if (command === "queue") {
      const packets = queue(database, policy, Boolean(flags.all));
      if (flags.format === "markdown") {
        process.stdout.write(markdownQueue(packets));
      } else {
        process.stdout.write(JSON.stringify(packets, null, 2) + "\n");
      }
      return;
    }
    if (command === "show") {
      process.stdout.write(
        JSON.stringify(showOpportunity(database, required(flags, "id"), policy), null, 2) + "\n",
      );
      return;
    }
    if (command === "decide") {
      process.stdout.write(JSON.stringify(decide(database, flags), null, 2) + "\n");
      return;
    }
    if (command === "prepare-action") {
      process.stdout.write(JSON.stringify(prepareAction(database, flags, policy), null, 2) + "\n");
      return;
    }
    if (command === "record-outcome") {
      process.stdout.write(JSON.stringify(recordOutcome(database, flags), null, 2) + "\n");
      return;
    }
    throw new Error("Unknown command: " + command + "\n\n" + help());
  } finally {
    database.close();
  }
}

try {
  main();
} catch (error) {
  process.stderr.write("Croki expansion operator error: " + error.message + "\n");
  process.exitCode = 1;
}
