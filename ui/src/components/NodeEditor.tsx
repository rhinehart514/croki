import { useState } from "react";
import {
  Check, Copy, ExternalLink, LoaderCircle, Pencil, Play, Save, ShieldCheck, Sparkles, Trash2, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { itemKey } from "@/lib/itemKey";
import { healthHex } from "@/lib/health";
import { SlidingTabs } from "@/components/SlidingTabs";
import type {
  ConnectorMeta, ContextManifest, EngineSubsystem, GateDecision, GTMContractAudit, GTMGraph, GTMItem, GTMNode,
  GTMNodeCategory, GTMNodeResult, GTMRunResult, NodeSelection,
} from "@/types";

type DetailTab = "overview" | "rules" | "signals" | "history";

// ─── Connector selector ───────────────────────────────────────────────────────

function ConnectorSelector({
  category, value, connectors, onChange,
}: {
  category: GTMNodeCategory; value: string;
  connectors: ConnectorMeta[]; onChange: (id: string) => void;
}) {
  const opts   = connectors.filter((c) => c.category === category);
  const active = connectors.find((c) => c.id === value && c.category === category);
  if (opts.length <= 1 || category === "resource" || category === "context") {
    return (
      <span className={`connector-badge ${active?.configured && !active.stub ? "connector-ready" : "connector-missing"}`}>
        {active?.name ?? value}
        {active?.stub ? <span className="connector-key-hint">· not implemented</span> : null}
        {active && !active.stub && !active.configured && active.envKey
          ? <span className="connector-key-hint">· needs {active.envKey}</span>
          : null}
      </span>
    );
  }
  return (
    <select className="connector-select" value={value} onChange={(e) => onChange(e.target.value)}>
      {opts.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}{c.stub ? " (not implemented)" : !c.configured ? " (not configured)" : ""}
        </option>
      ))}
    </select>
  );
}

// ─── Prospect card ────────────────────────────────────────────────────────────

function ProspectCard({ item, showDraft }: { item: GTMItem; showDraft?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    if (!item.draft) return;
    void navigator.clipboard.writeText(item.draft).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 1600);
    });
  };
  return (
    <div className="prospect-card">
      <div className="prospect-card-header">
        <span className="prospect-card-name">
          {item.name}
          {item.url && (
            <a href={item.url} target="_blank" rel="noreferrer" className="prospect-link">
              <ExternalLink />
            </a>
          )}
        </span>
        {item.score != null && (
          <span className="score-badge" style={{
            color: (item.score ?? 0) >= 0.6 ? "var(--proven)" :
                   (item.score ?? 0) >= 0.3 ? "var(--gap)" : "var(--blind)",
          }}>
            {Math.round((item.score ?? 0) * 100)}%
          </span>
        )}
      </div>
      {item.summary && <p className="prospect-summary">{String(item.summary).slice(0, 160)}</p>}
      {showDraft && item.draft && (
        <div className="prospect-draft">
          <div className="prospect-draft-header">
            <span>Draft</span>
            <button className="copy-button" onClick={copy} type="button">
              <Copy /> {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="prospect-draft-body">{item.draft}</p>
        </div>
      )}
    </div>
  );
}

// ─── Gate review (per-item founder decisions — the loop's learning signal) ────

type ReviewState = Record<string, { decision?: "approve" | "reject"; draft: string; editing: boolean }>;

export function GateReview({
  items, running, onSubmit, onApproveAll,
}: {
  items: GTMItem[];
  running: boolean;
  onSubmit: (decisions: Record<string, GateDecision>) => void;
  onApproveAll: () => void;
}) {
  const drafts = items.filter((i) => i.draft);
  const [state, setState] = useState<ReviewState>(() => {
    const init: ReviewState = {};
    drafts.forEach((it, i) => {
      init[itemKey(it, i)] = {
        decision: it.approvalStatus === "approved" ? "approve"
          : it.approvalStatus === "rejected" ? "reject" : undefined,
        draft: it.draft ?? "",
        editing: false,
      };
    });
    return init;
  });

  const setItem = (k: string, patch: Partial<ReviewState[string]>) =>
    setState((s) => ({ ...s, [k]: { ...s[k], ...patch } }));
  const decidedCount = Object.values(state).filter((v) => v.decision).length;

  const submit = () => {
    const out: Record<string, GateDecision> = {};
    drafts.forEach((it, i) => {
      const k = itemKey(it, i);
      const v = state[k];
      if (!v?.decision) return;
      const edited = v.draft.trim() && v.draft.trim() !== (it.draft ?? "").trim();
      out[k] = {
        decision: v.decision,
        ...(v.decision === "approve" && edited ? { editedDraft: v.draft } : {}),
      };
    });
    onSubmit(out);
  };

  if (drafts.length === 0) {
    return (
      <p className="gate-review-empty">
        No drafts staged for review yet. Run the loop to generate drafts, then approve, reject, or edit each one.
      </p>
    );
  }

  return (
    <div className="gate-review">
      <div className="gate-review-head">
        <span className="agent-editor-section-label" style={{ marginTop: 0 }}>
          Review {drafts.length} draft{drafts.length !== 1 ? "s" : ""}
        </span>
        <span className="gate-review-progress">{decidedCount}/{drafts.length} decided</span>
      </div>

      {drafts.map((it, i) => {
        const k = itemKey(it, i);
        const v = state[k];
        return (
          <div className={cn("gate-review-card", v?.decision && `gate-${v.decision}`)} key={k}>
            <div className="gate-review-card-head">
              <span className="gate-review-name">{it.name ?? k}</span>
              {v?.decision && (
                <span className={cn("gate-review-pill", `pill-${v.decision}`)}>
                  {v.decision === "approve" ? "Approved" : "Rejected"}
                </span>
              )}
            </div>
            {v?.editing ? (
              <textarea
                className="gate-review-draft-edit"
                rows={5}
                value={v.draft}
                aria-label={`Edit draft for ${it.name ?? k}`}
                onChange={(e) => setItem(k, { draft: e.target.value })}
              />
            ) : (
              <p className="gate-review-draft">{v?.draft}</p>
            )}
            <div className="gate-review-actions">
              <button
                className={cn("gate-btn gate-btn-approve", v?.decision === "approve" && "active")}
                onClick={() => setItem(k, { decision: "approve" })}
                type="button"
              >
                <Check /> Approve
              </button>
              <button
                className={cn("gate-btn gate-btn-reject", v?.decision === "reject" && "active")}
                onClick={() => setItem(k, { decision: "reject" })}
                type="button"
              >
                <X /> Reject
              </button>
              <button
                className="gate-btn gate-btn-edit"
                onClick={() => setItem(k, { editing: !v?.editing })}
                type="button"
              >
                <Pencil /> {v?.editing ? "Done editing" : "Edit"}
              </button>
            </div>
          </div>
        );
      })}

      <div className="gate-review-submit-row">
        <Button disabled={running || decidedCount === 0} onClick={submit} type="button">
          {running ? <LoaderCircle className="spin" /> : <ShieldCheck />}
          Submit review ({decidedCount})
        </Button>
        <Button className="secondary-button" disabled={running} onClick={onApproveAll} type="button">
          Approve all
        </Button>
      </div>
      <p className="gate-review-note">
        Your decisions feed the next run: approved drafts become voice examples, rejected ones become an avoid-list.
      </p>
    </div>
  );
}

// ─── Context node editor ──────────────────────────────────────────────────────

function ContextEditor({ node, graph, onUpdate }: {
  node: GTMNode; graph: GTMGraph; onUpdate: (g: GTMGraph) => void;
}) {
  const [config, setConfig] = useState<Record<string, string>>({
    query:       String(node.config.query ?? ""),
    geography:   String(node.config.geography ?? ""),
    industry:    String(node.config.industry ?? ""),
    keywords:    (node.config.keywords as string[] ?? []).join(", "),
    name:        String(node.config.name ?? ""),
    description: String(node.config.description ?? ""),
    valueProps:  (node.config.valueProps as string[] ?? []).join("\n"),
  });

  const isIcp = node.connector === "icp";

  const save = () => {
    const newConfig = isIcp
      ? {
          query: config.query, geography: config.geography || undefined,
          industry: config.industry || undefined,
          keywords: config.keywords.split(",").map((k) => k.trim()).filter(Boolean),
        }
      : {
          name: config.name, description: config.description,
          valueProps: config.valueProps.split("\n").map((v) => v.trim()).filter(Boolean),
        };
    onUpdate({ ...graph, nodes: graph.nodes.map((n) => n.id !== node.id ? n : { ...n, config: newConfig }) });
  };

  return (
    <div className="agent-editor">
      <div className="agent-editor-section-label">
        {isIcp ? "ICP Definition" : "Product Context"}
      </div>
      {isIcp ? (
        <>
          <label className="agent-editor-field"><span>Search query</span>
            <textarea rows={3} value={config.query}
              onChange={(e) => setConfig((c) => ({ ...c, query: e.target.value }))} />
          </label>
          <label className="agent-editor-field"><span>Geography</span>
            <input value={config.geography}
              onChange={(e) => setConfig((c) => ({ ...c, geography: e.target.value }))} />
          </label>
          <label className="agent-editor-field"><span>Industry</span>
            <input value={config.industry}
              onChange={(e) => setConfig((c) => ({ ...c, industry: e.target.value }))} />
          </label>
          <label className="agent-editor-field"><span>Score keywords (comma-separated)</span>
            <input value={config.keywords}
              onChange={(e) => setConfig((c) => ({ ...c, keywords: e.target.value }))} />
          </label>
        </>
      ) : (
        <>
          <label className="agent-editor-field"><span>Product name</span>
            <input value={config.name}
              onChange={(e) => setConfig((c) => ({ ...c, name: e.target.value }))} />
          </label>
          <label className="agent-editor-field"><span>Description / value prop</span>
            <textarea rows={4} value={config.description}
              onChange={(e) => setConfig((c) => ({ ...c, description: e.target.value }))} />
          </label>
          <label className="agent-editor-field"><span>Value points (one per line)</span>
            <textarea rows={4} value={config.valueProps}
              onChange={(e) => setConfig((c) => ({ ...c, valueProps: e.target.value }))} />
          </label>
        </>
      )}
      <Button className="secondary-button" onClick={save} type="button"><Save /> Save context</Button>
    </div>
  );
}

// ─── Resource node editor ─────────────────────────────────────────────────────

function ResourceEditor({ node, connectors }: { node: GTMNode; connectors: ConnectorMeta[] }) {
  const conn = connectors.find((c) => c.id === node.connector && c.category === "resource");
  return (
    <div className="agent-editor">
      <div className="agent-editor-section-label">Resource — {node.label}</div>
      {conn ? (
        <>
          <p style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.5, margin: "8px 0" }}>
            {conn.description}
          </p>
          <dl className="signal-list" style={{ marginTop: 10 }}>
            {conn.envKey && (
              <div>
                <dt>Key required</dt>
                <dd style={{ color: conn.configured ? "var(--proven)" : "var(--gap)" }}>
                  {conn.stub ? "not implemented" : `${conn.envKey} · ${conn.configured ? "configured" : "missing"}`}
                </dd>
              </div>
            )}
            {conn.allowed && conn.allowed.length > 0 && (
              <div><dt>Allowed</dt><dd>{conn.allowed.join(", ")}</dd></div>
            )}
            {conn.blocked && conn.blocked.length > 0 && (
              <div><dt>Blocked</dt><dd>{conn.blocked.join(", ")}</dd></div>
            )}
          </dl>
        </>
      ) : (
        <p style={{ fontSize: 11, color: "var(--faint)" }}>Resource connector not found.</p>
      )}
    </div>
  );
}

// ─── Work node editor ─────────────────────────────────────────────────────────

// The four canonical context providers, with the honest default reason each shows when it
// contributed nothing. Rendering the full set (not just what landed) is the point: an empty
// taste layer is a visible signal to gate a draft, not an omission.
const CONTEXT_PROVIDERS: Array<{ key: string; blankReason: string }> = [
  { key: "product", blankReason: "no product grounding" },
  { key: "taste", blankReason: "no decisions yet — gate a draft" },
  { key: "state", blankReason: "no prior runs" },
  { key: "signal", blankReason: "no source wired" },
];

// Context inspector — makes visible what the model actually knew when this step ran. This is the
// debugger for agent loops: the reason they are miserable to debug is you cannot see each step's
// context. Reads the manifest off the result; nothing to show until the step has run.
function ContextInspector({ manifest, errorKind, retriable }: {
  manifest?: ContextManifest; errorKind?: string; retriable?: boolean;
}) {
  if (!manifest || !manifest.providers?.length) return null;
  const byName = new Map(manifest.providers.map((p) => [p.name, p] as const));
  return (
    <div className="node-editor-section">
      <label className="node-overview-label">CONTEXT ASSEMBLED FOR THIS STEP</label>
      <dl className="node-config-dl">
        {CONTEXT_PROVIDERS.map(({ key, blankReason }) => {
          const p = byName.get(key);
          return (
            <div key={key}>
              <dt className="node-config-dt">{key}</dt>
              <dd className="node-config-dd">
                {!p
                  ? blankReason
                  : !p.enabled
                    ? "off (ablated)"
                    : p.contributed
                      ? `${p.chars} chars · ${p.layer}`
                      : p.error
                        ? `error: ${p.error}`
                        : blankReason}
              </dd>
            </div>
          );
        })}
      </dl>
      <div className="agent-editor-vars">
        {manifest.contributingProviders ?? 0}/4 providers · {manifest.totalChars ?? 0} chars → fed to Claude
        {errorKind ? ` · ${retriable ? "retriable" : "failed"}: ${errorKind}` : ""}
      </div>
    </div>
  );
}

function WorkNodeEditor({
  node, graph, connectors, result, running, onUpdate, onRun, onApprove, onSubmitReview,
}: {
  node: GTMNode; graph: GTMGraph; connectors: ConnectorMeta[];
  result?: GTMNodeResult; running: boolean;
  onUpdate: (g: GTMGraph) => void; onRun: () => void; onApprove: () => void;
  onSubmitReview: (decisions: Record<string, GateDecision>) => void;
}) {
  const [prompt, setPrompt]       = useState(node.agentPrompt ?? "");
  const [connector, setConnector] = useState(node.connector ?? "default");
  const [stepRef, setStepRef] = useState(node.ref ?? "");
  const [provider, setProvider] = useState(String(node.config?.provider ?? "claude"));
  const [endpoint, setEndpoint] = useState(String(node.config?.endpoint ?? ""));
  const [method, setMethod] = useState(String(node.config?.method ?? "GET"));
  const [csvText, setCsvText] = useState(String(node.config?.csv ?? ""));
  const [manualItemsText, setManualItemsText] = useState(JSON.stringify(node.config?.items ?? [], null, 2));
  const [configText, setConfigText] = useState(JSON.stringify(node.config ?? {}, null, 2));
  const [configError, setConfigError] = useState<string | null>(null);
  const [saved, setSaved]         = useState(false);
  const [editRawConfig, setEditRawConfig] = useState(false);
  const [accepts, setAccepts] = useState((node.contract?.accepts ?? []).join(", "));
  const [emits, setEmits] = useState((node.contract?.emits ?? []).join(", "));
  const [minItems, setMinItems] = useState(String(node.contract?.minItems ?? ""));

  const showPrompt   = node.category === "generate" || (node.agentPrompt !== undefined && node.agentPrompt !== "");
  const items        = result?.items ?? [];
  const showDraft    = node.category === "generate" || node.category === "gate" || node.category === "execute";
  const configEntries = Object.entries(node.config ?? {});

  const save = () => {
    let config: Record<string, unknown>;
    try { config = JSON.parse(configText) as Record<string, unknown>; setConfigError(null); }
    catch { setConfigError("Configuration must be valid JSON."); return; }
    if (connector === "manual") {
      try {
        const items = JSON.parse(manualItemsText) as unknown;
        if (!Array.isArray(items)) throw new Error();
        config.items = items;
      } catch {
        setConfigError("Manual input must be a JSON list of records.");
        return;
      }
    }
    if (connector === "csv") config.csv = csvText;
    if (connector === "api" || connector === "http") {
      config.endpoint = endpoint;
      config.method = method;
    }
    if (node.kind === "agent") config.provider = provider;
    const fields = (value: string) => [...new Set(value.split(",").map((field) => field.trim()).filter(Boolean))];
    const minimum = minItems.trim() === "" ? undefined : Number(minItems);
    if (minimum !== undefined && (!Number.isInteger(minimum) || minimum < 0)) {
      setConfigError("Minimum items must be a whole number of 0 or more.");
      return;
    }
    onUpdate({
      ...graph,
      nodes: graph.nodes.map((n) => n.id !== node.id ? n : {
        ...n,
        agentPrompt: prompt,
        connector,
        ...(node.kind && node.kind !== "tool" ? { ref: stepRef } : {}),
        config,
        contract: {
          accepts: fields(accepts),
          emits: fields(emits),
          ...(minimum && minimum > 0 ? { minItems: minimum } : {}),
        },
      }),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
  };

  return (
    <div className="agent-editor">
      {(!node.kind || node.kind === "tool") ? (
        <div className="agent-editor-connector-row">
          <div>
            <label className="node-overview-label">CONNECTOR</label>
            <ConnectorSelector category={node.category} value={connector} connectors={connectors} onChange={setConnector} />
          </div>
        </div>
      ) : null}

      {node.kind && node.kind !== "tool" ? (
        <div className="node-editor-section configuration-identity">
          <label className="node-overview-label">{node.kind === "agent" ? "AGENT CONFIGURATION" : "STEP DEFINITION"}</label>
          <div className="configuration-field-row">
            <label className="agent-editor-field">
              <span>{node.kind === "agent" ? "Agent file" : "Reference"}</span>
              <input value={stepRef} onChange={(event) => setStepRef(event.target.value)} placeholder="gtm-enrich" />
            </label>
            {node.kind === "agent" ? (
              <label className="agent-editor-field">
                <span>Model provider</span>
                <select className="connector-select" value={provider} onChange={(event) => setProvider(event.target.value)}>
                  <option value="claude">Claude</option>
                  <option value="codex">Codex</option>
                </select>
              </label>
            ) : null}
          </div>
        </div>
      ) : null}

      {showPrompt && (
        <div className="node-editor-section">
          <label className="node-overview-label">AGENT PROMPT</label>
          <textarea className="agent-editor-prompt" rows={7} value={prompt}
            onChange={(e) => setPrompt(e.target.value)} />
          {node.category === "generate" && (
            <div className="agent-editor-vars">
              Variables: <code>{"{senderName}"}</code> <code>{"{productContext}"}</code>{" "}
              <code>{"{prospectName}"}</code> <code>{"{prospectSummary}"}</code>
            </div>
          )}
        </div>
      )}

      <div className="node-editor-section">
        <label className="node-overview-label">INPUT OR OUTPUT SETUP</label>
        {connector === "manual" ? (
          <label className="agent-editor-field">
            <span>Manual records <small>JSON list</small></span>
            <textarea
              rows={8}
              value={manualItemsText}
              onChange={(event) => setManualItemsText(event.target.value)}
              placeholder={'[\n  { "metro": "Buffalo" }\n]'}
            />
          </label>
        ) : connector === "csv" ? (
          <label className="agent-editor-field">
            <span>CSV data</span>
            <textarea
              rows={9}
              value={csvText}
              onChange={(event) => setCsvText(event.target.value)}
              placeholder={"metro,company\nBuffalo,Example PCO"}
            />
          </label>
        ) : connector === "api" || connector === "http" ? (
          <div className="configuration-field-row endpoint-row">
            <label className="agent-editor-field">
              <span>Endpoint</span>
              <input
                type="url"
                value={endpoint}
                onChange={(event) => setEndpoint(event.target.value)}
                placeholder="https://api.example.com/records"
              />
            </label>
            <label className="agent-editor-field">
              <span>Method</span>
              <select className="connector-select" value={method} onChange={(event) => setMethod(event.target.value)}>
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="PATCH">PATCH</option>
              </select>
            </label>
          </div>
        ) : (
          <p className="contract-help">This step uses its connector defaults. Advanced settings remain available below.</p>
        )}
      </div>

      <div className="node-editor-section">
        <label className="node-overview-label">DATA CONTRACT</label>
        <p className="contract-help">Name the fields this step needs and promises. The run stops if reality does not match.</p>
        <label className="agent-editor-field">
          <span>Needs from upstream <small>comma-separated</small></span>
          <input value={accepts} onChange={(event) => setAccepts(event.target.value)} placeholder="company, personalFact, nowTrigger" />
        </label>
        <label className="agent-editor-field">
          <span>Produces for downstream <small>comma-separated</small></span>
          <input value={emits} onChange={(event) => setEmits(event.target.value)} placeholder="draft, subject" />
        </label>
        <label className="agent-editor-field">
          <span>Minimum items</span>
          <input min="0" type="number" value={minItems} onChange={(event) => setMinItems(event.target.value)} placeholder="0" />
        </label>
      </div>

      <div className="node-editor-section">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <label className="node-overview-label" style={{ marginBottom: 0 }}>ADVANCED CONFIGURATION</label>
          <button
            className="config-edit-raw-btn"
            onClick={() => setEditRawConfig((v) => !v)}
            type="button"
          >
            {editRawConfig ? "Show summary" : "Edit raw"}
          </button>
        </div>
        {editRawConfig ? (
          <textarea className="agent-editor-prompt" rows={7} value={configText}
            aria-label="Step configuration JSON"
            onChange={(e) => setConfigText(e.target.value)} />
        ) : (
          <dl className="node-config-dl">
            {configEntries.length === 0 ? (
              <div><dt className="node-config-dt">—</dt><dd className="node-config-dd">No configuration</dd></div>
            ) : configEntries.map(([k, v]) => (
              <div key={k}>
                <dt className="node-config-dt">{k}</dt>
                <dd className="node-config-dd">
                  {typeof v === "object" ? JSON.stringify(v) : String(v)}
                </dd>
              </div>
            ))}
          </dl>
        )}
        {configError && <div className="error-message" role="alert">{configError}</div>}
      </div>

      {result && !result.ok && result.error && (
        <div className="error-message" style={{ marginTop: 12 }}><span>{result.error}</span></div>
      )}

      <ContextInspector
        manifest={result?.meta?.contextManifest as ContextManifest | undefined}
        errorKind={result?.meta?.errorKind as string | undefined}
        retriable={result?.meta?.retriable as boolean | undefined}
      />

      {node.category === "gate" ? (
        <div className="node-editor-section">
          {result ? (
            <GateReview
              items={items}
              running={running}
              onSubmit={onSubmitReview}
              onApproveAll={onApprove}
            />
          ) : (
            <p className="gate-review-empty">Run the loop to stage drafts for founder review.</p>
          )}
        </div>
      ) : (
        <>
          {result?.pendingReview && (
            <div className="recommendation" style={{ marginTop: 12 }}>
              <span>Awaiting review</span>
              <p>{result.meta?.awaitingReview as number ?? 0} items staged for founder approval.</p>
              <Button disabled={running} onClick={onApprove} type="button" style={{ marginTop: 10 }}>
                {running ? <LoaderCircle className="spin" /> : <ShieldCheck />}
                Approve and continue
              </Button>
            </div>
          )}

          {items.length > 0 && (
            <div className="agent-results">
              <div className="agent-editor-section-label" style={{ marginTop: 16 }}>
                {items.length} results
              </div>
              {items.map((item, i) => (
                <ProspectCard key={(item.id as string) ?? i} item={item} showDraft={showDraft} />
              ))}
            </div>
          )}
        </>
      )}

      <div className="node-action-row">
        <Button disabled={running} onClick={onRun} type="button">
          {running ? <LoaderCircle className="spin" /> : <Play />}
          {running ? "Running…" : "Run this step"}
        </Button>
        <Button className="secondary-button" onClick={save} type="button">
          {saved ? <Check /> : <Save />}
          {saved ? "Saved" : "Save"}
        </Button>
      </div>
    </div>
  );
}

// ─── Overview tab content ─────────────────────────────────────────────────────

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  resource:  "Declares a connector dependency for downstream nodes.",
  source:    "Finds and imports prospect records from the configured source.",
  context:   "Provides ICP criteria or product context consumed by downstream nodes.",
  enrich:    "Enriches prospect records with additional data.",
  filter:    "Scores and filters prospects against ICP criteria.",
  generate:  "Drafts personalized outreach using the configured agent prompt.",
  gate:      "Pauses execution for founder review before continuing.",
  execute:   "Stages or sends approved items via the configured connector.",
  measure:   "Captures outcomes and preserves them in the run record.",
};

const GATE_PATH_COLORS = ["#16a34a", "#d97706", "#2563eb", "#18181b", "#dc2626"];

function NodeOverview({
  node, graph, result, contractAudit, connectors, running, subsystem, onApprove,
}: {
  node: GTMNode;
  graph: GTMGraph;
  result?: GTMNodeResult;
  contractAudit?: GTMContractAudit;
  connectors: ConnectorMeta[];
  running: boolean;
  subsystem?: EngineSubsystem | null;
  onApprove: () => void;
}) {
  const showConnector = !["gate", "resource", "context"].includes(node.category);
  const conn  = showConnector
    ? connectors.find((c) => c.id === node.connector && c.category === node.category)
    : null;
  const ok    = result?.ok;
  const items = result?.items ?? [];

  // Outgoing edges → "paths" section
  const outEdges = graph.edges.filter((e) => e.source === node.id && e.edgeType !== "feedback");
  const showPaths = outEdges.length > 0 && (node.category === "gate" || node.category === "filter" || outEdges.length > 1);

  return (
    <div className="node-overview">
      <div className="node-overview-main">
        <div className="node-overview-section node-overview-intro">
          <div className="node-overview-label">What this step does</div>
          <p className="node-overview-desc">
            {CATEGORY_DESCRIPTIONS[node.category] ?? "Processes items in the loop."}
          </p>
        </div>

        {showPaths && (
          <div className="node-overview-section">
            <div className="node-overview-label">Current paths</div>
            <div className="node-paths">
              {outEdges.map((e, i) => {
                const target = graph.nodes.find((n) => n.id === e.target);
                return (
                  <div className="node-path-row" key={e.id}>
                    <span className="node-path-dot" style={{ background: GATE_PATH_COLORS[i % GATE_PATH_COLORS.length] }} />
                    <span className="node-path-from">{e.label ?? `Path ${i + 1}`}</span>
                    <span className="node-path-arrow">→</span>
                    <span className="node-path-to">{target?.label ?? e.target}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="node-overview-section">
          <div className="node-overview-label">Notes</div>
          <textarea
            className="node-notes-field"
            placeholder="Capture context, caveats, or a change you want Claude to make…"
            rows={4}
          />
        </div>

        <div className="node-overview-section">
          <div className="node-linked-signals">
            <span className="node-overview-label" style={{ marginBottom: 0 }}>Linked signals</span>
            <span className="node-linked-count">
              {graph.edges.filter((e) => e.source === node.id || e.target === node.id).length}
            </span>
            <span className="node-linked-arrow">›</span>
          </div>
        </div>
      </div>

      <aside className="node-overview-side">
        <div className="node-overview-section node-overview-health">
          <div className="node-overview-label">Step status</div>
          <div className="node-health-rows">
            {subsystem && subsystem.health > 0 && (
              <div className="node-health-row">
                <span>Health</span>
                <span
                  className="node-health-badge"
                  style={{ color: healthHex(subsystem.health), borderColor: healthHex(subsystem.health), background: "transparent" }}
                >
                  {subsystem.health}
                </span>
              </div>
            )}
            <div className="node-health-row">
              <span>Overall</span>
              <span className={`node-health-badge ${!result ? "" : ok ? "ok" : "err"}`}>
                {!result ? "Not run" : ok ? "Healthy" : "Error"}
              </span>
            </div>
            {result && (
              <div className="node-health-row">
                <span>Items</span>
                <span className="node-health-val">{items.length}</span>
              </div>
            )}
            {contractAudit && (
              <div className="node-health-row">
                <span>Data contract</span>
                <span className={`node-health-badge contract-${contractAudit.state}`}>{contractAudit.state}</span>
              </div>
            )}
            {result?.error && (
              <div className="node-health-row err-row">
                <span>Last error</span>
                <span className="node-health-err">{result.error.slice(0, 90)}</span>
              </div>
            )}
          </div>
          {contractAudit ? <p className="contract-audit-message">{contractAudit.message}</p> : null}
          {subsystem && subsystem.health > 0 && subsystem.activeIssues[0] ? (
            <div className="node-health-why">
              <p className="node-health-issue">{subsystem.activeIssues[0]}</p>
              {subsystem.suggestedActions[0] ? (
                <p className="node-health-action">→ {subsystem.suggestedActions[0]}</p>
              ) : null}
            </div>
          ) : null}
        </div>

        {conn && (
          <div className="node-overview-section">
            <div className="node-overview-label">Connector</div>
            <div className="node-overview-connector">
              <span className={`connector-dot ${conn.configured && !conn.stub ? "ready" : "missing"}`} />
              <span className="connector-name">{conn.name}</span>
              {conn.stub && <span className="connector-key-hint">not implemented</span>}
              {!conn.stub && !conn.configured && conn.envKey && (
                <span className="connector-key-hint">needs {conn.envKey}</span>
              )}
            </div>
          </div>
        )}

        {result?.pendingReview && (
          <div className="node-overview-section">
            <div className="node-overview-label">Founder decision</div>
            <div className="node-suggested-change">
              <Sparkles className="node-suggested-icon" />
              <div>
                <strong>{result.meta?.awaitingReview as number ?? items.length} items awaiting review</strong>
                <p>Review the prepared artifacts before the workflow can continue.</p>
              </div>
            </div>
            <div className="node-action-row" style={{ marginTop: 10 }}>
              <Button disabled={running} onClick={onApprove} type="button">
                {running ? <LoaderCircle className="spin" /> : <ShieldCheck />}
                Review and continue
              </Button>
            </div>
          </div>
        )}

      </aside>
    </div>
  );
}

// ─── Top-level NodeEditor ─────────────────────────────────────────────────────

const SIGNAL_STUBS = [
  { type: "Reply", icon: "↩", count: 0, last: null },
  { type: "Click", icon: "↗", count: 0, last: null },
  { type: "View",  icon: "👁", count: 0, last: null },
];

export function NodeEditor({
  selection, graph, connectors, runResult, runningNodeId, flowRuns, subsystem,
  contractAudits = {}, onUpdateGraph, onRunNode, onApproveGate, onSubmitReview, onOpenArtifact, onDeleteNode,
}: {
  selection: NodeSelection;
  graph: GTMGraph | null;
  connectors: ConnectorMeta[];
  runResult: GTMRunResult | null;
  runningNodeId: string | null;
  flowRuns?: GTMRunResult[];
  subsystem?: EngineSubsystem | null;
  contractAudits?: Record<string, GTMContractAudit>;
  onUpdateGraph: (g: GTMGraph) => void;
  onRunNode: (nodeId: string) => void;
  onApproveGate: (nodeId: string) => void;
  onSubmitReview: (nodeId: string, decisions: Record<string, GateDecision>) => void;
  onOpenArtifact?: (type: "agent" | "skill", ref: string) => void;
  onDeleteNode?: (nodeId: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<DetailTab>("overview");
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!graph || !selection) return null;
  const node = graph.nodes.find((n) => n.id === selection);
  if (!node) return null;

  const result  = runResult?.nodes[node.id];
  const running = runningNodeId === node.id;
  // An agent/skill step runs a real .md artifact — surface a door to edit it fully.
  const artifactType = node.kind === "agent" ? "agent" : node.kind === "skill" ? "skill" : null;

  return (
    <div className="node-editor-wrap">
      {artifactType && node.ref && onOpenArtifact && (
        <div className="artifact-door">
          <div className="artifact-door-text">
            <span className="artifact-door-label">{artifactType === "agent" ? "Subagent" : "Skill"}</span>
            <code className="artifact-door-ref">{node.ref}</code>
            <span className="artifact-door-sub">runs a real markdown file you can edit fully</span>
          </div>
          <button
            className="artifact-door-btn"
            onClick={() => onOpenArtifact(artifactType, node.ref!)}
            type="button"
          >
            Edit {artifactType} file
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="node-editor-tabs">
        <SlidingTabs
          items={(["overview", "rules", "signals", "history"] as DetailTab[]).map((tab) => ({
            value: tab,
            label: tab === "rules" ? "Configuration" : tab === "history" ? "Run history" : tab.charAt(0).toUpperCase() + tab.slice(1),
          }))}
          value={activeTab}
          onChange={setActiveTab}
          layoutId="node-editor-tab"
          size="sm"
        />
      </div>

      {/* Tab content */}
      <div className="node-editor-body">
        {activeTab === "overview" && (
          <NodeOverview
            node={node}
            graph={graph}
            result={result}
            contractAudit={contractAudits[node.id] ?? result?.contractAudit}
            connectors={connectors}
            running={running}
            subsystem={subsystem}
            onApprove={() => onApproveGate(node.id)}
          />
        )}

        {activeTab === "rules" && (
          node.category === "resource" ? (
            <ResourceEditor node={node} connectors={connectors} />
          ) : node.category === "context" ? (
            <ContextEditor node={node} graph={graph} onUpdate={onUpdateGraph} />
          ) : (
            <WorkNodeEditor
              key={selection}
              node={node}
              graph={graph}
              connectors={connectors}
              result={result}
              running={running}
              onUpdate={onUpdateGraph}
              onRun={() => onRunNode(node.id)}
              onApprove={() => onApproveGate(node.id)}
              onSubmitReview={(d) => onSubmitReview(node.id, d)}
            />
          )
        )}

        {activeTab === "signals" && (
          <div className="node-signals-list">
            {SIGNAL_STUBS.map((s) => (
              <div className="node-signal-row" key={s.type}>
                <span className="node-signal-icon">{s.icon}</span>
                <span className="node-signal-type">{s.type}</span>
                <span className="node-signal-count">{s.count > 0 ? s.count : "—"}</span>
                <span className="node-signal-last">{s.last ?? "No data yet"}</span>
              </div>
            ))}
            <p className="node-signals-note">Live signal tracking connects when you run the channel.</p>
          </div>
        )}

        {activeTab === "history" && (() => {
          const nodeRuns = (flowRuns ?? [])
            .slice(-5)
            .reverse()
            .map((run) => ({ run, result: run.nodes?.[node.id] }))
            .filter((r) => r.result);
          return (
            <div className="node-history-list">
              {nodeRuns.length === 0 ? (
                <p className="node-history-empty">No runs for this node yet.</p>
              ) : nodeRuns.map(({ run, result: nr }) => (
                <div className="node-history-entry" key={run.runId}>
                  <span className={`sim-run-dot ${nr.ok ? "ok" : "err"}`} />
                  <div>
                    <strong>{nr.ok ? "Completed" : "Failed"}</strong>
                    <p>{nr.items.length} items · {run.runId.slice(0, 10)}</p>
                    {!nr.ok && nr.error && (
                      <p style={{ color: "var(--danger)", fontSize: 10 }}>{nr.error.slice(0, 80)}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          );
        })()}
      </div>
      {onDeleteNode ? (
        <div className="node-delete-row">
          <button
            className={confirmDelete ? "confirming" : ""}
            disabled={running}
            onClick={() => {
              if (confirmDelete) onDeleteNode(node.id);
              else setConfirmDelete(true);
            }}
            type="button"
          >
            <Trash2 /> {confirmDelete ? "Delete step and connections" : "Delete step"}
          </button>
          {confirmDelete ? <button onClick={() => setConfirmDelete(false)} type="button">Cancel</button> : null}
        </div>
      ) : null}
    </div>
  );
}
