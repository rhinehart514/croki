import { useState } from "react";
import {
  Check, Copy, ExternalLink, LoaderCircle, Play, Save, ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  ConnectorMeta, GTMGraph, GTMItem, GTMNode,
  GTMNodeCategory, GTMNodeResult, GTMRunResult, NodeSelection,
} from "@/types";

// ─── Shared field wrapper ─────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="agent-editor-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

// ─── Connector selector ───────────────────────────────────────────────────────

function ConnectorSelector({
  category, value, connectors, onChange,
}: {
  category: GTMNodeCategory; value: string;
  connectors: ConnectorMeta[]; onChange: (id: string) => void;
}) {
  const opts = connectors.filter((c) => c.category === category);
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

// ─── Context node editor (ICP / product) ─────────────────────────────────────

function ContextEditor({
  node, graph, onUpdate,
}: {
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
          valueProps: config.valueProps.split("\n").map((value) => value.trim()).filter(Boolean),
        };
    onUpdate({
      ...graph,
      nodes: graph.nodes.map((n) => n.id !== node.id ? n : { ...n, config: newConfig }),
    });
  };

  return (
    <div className="agent-editor">
      <div className="agent-editor-section-label">
        {isIcp ? "ICP Definition" : "Product Context"}
      </div>
      {isIcp ? (
        <>
          <Field label="Search query">
            <textarea rows={3} value={config.query}
              onChange={(e) => setConfig((c) => ({ ...c, query: e.target.value }))} />
          </Field>
          <Field label="Geography">
            <input value={config.geography}
              onChange={(e) => setConfig((c) => ({ ...c, geography: e.target.value }))} />
          </Field>
          <Field label="Industry">
            <input value={config.industry}
              onChange={(e) => setConfig((c) => ({ ...c, industry: e.target.value }))} />
          </Field>
          <Field label="Score keywords (comma-separated)">
            <input value={config.keywords}
              onChange={(e) => setConfig((c) => ({ ...c, keywords: e.target.value }))} />
          </Field>
        </>
      ) : (
        <>
          <Field label="Product name">
            <input value={config.name}
              onChange={(e) => setConfig((c) => ({ ...c, name: e.target.value }))} />
          </Field>
          <Field label="Description / value prop">
            <textarea rows={4} value={config.description}
              onChange={(e) => setConfig((c) => ({ ...c, description: e.target.value }))} />
          </Field>
          <Field label="Value points (one per line)">
            <textarea rows={4} value={config.valueProps}
              onChange={(e) => setConfig((c) => ({ ...c, valueProps: e.target.value }))} />
          </Field>
        </>
      )}
      <Button className="build-button" onClick={save} type="button"><Save /> Save context</Button>
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
            {conn.approvalRequired && conn.approvalRequired.length > 0 && (
              <div><dt>Requires approval</dt><dd>{conn.approvalRequired.join(", ")}</dd></div>
            )}
          </dl>
        </>
      ) : (
        <p style={{ fontSize: 11, color: "var(--faint)" }}>Resource connector not found in registry.</p>
      )}
    </div>
  );
}

// ─── Work node editor (source, enrich, filter, generate, gate, execute, measure) ─

function WorkNodeEditor({
  node, graph, connectors, result, running, onUpdate, onRun, onApprove,
}: {
  node: GTMNode; graph: GTMGraph;
  connectors: ConnectorMeta[]; result?: GTMNodeResult;
  running: boolean;
  onUpdate: (g: GTMGraph) => void;
  onRun: () => void;
  onApprove: () => void;
}) {
  const [prompt, setPrompt]       = useState(node.agentPrompt ?? "");
  const [connector, setConnector] = useState(node.connector ?? "default");
  const [configText, setConfigText] = useState(JSON.stringify(node.config ?? {}, null, 2));
  const [configError, setConfigError] = useState<string | null>(null);
  const [saved, setSaved]         = useState(false);

  const showPrompt = node.category === "generate" ||
    (node.agentPrompt !== undefined && node.agentPrompt !== "");

  const items = result?.items ?? [];
  const showDraft = node.category === "generate" || node.category === "gate" || node.category === "execute";

  const save = () => {
    let config: Record<string, unknown>;
    try {
      config = JSON.parse(configText) as Record<string, unknown>;
      setConfigError(null);
    } catch {
      setConfigError("Configuration must be valid JSON.");
      return;
    }
    onUpdate({
      ...graph,
      nodes: graph.nodes.map((n) =>
        n.id !== node.id ? n : { ...n, agentPrompt: prompt, connector, config }
      ),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
  };

  return (
    <div className="agent-editor">
      {/* Connector selector */}
      <div className="agent-editor-connector-row">
        <ConnectorSelector
          category={node.category} value={connector}
          connectors={connectors} onChange={setConnector}
        />
      </div>

      {/* Prompt editor for generate nodes */}
      {showPrompt && (
        <>
          <div className="agent-editor-section-label" style={{ marginTop: 16 }}>Agent prompt</div>
          <textarea className="agent-editor-prompt" rows={11} value={prompt}
            onChange={(e) => setPrompt(e.target.value)} />
          {node.category === "generate" && (
            <div className="agent-editor-vars">
              Variables: <code>{"{senderName}"}</code> <code>{"{productContext}"}</code>{" "}
              <code>{"{prospectName}"}</code> <code>{"{prospectSummary}"}</code>{" "}
              <code>{"{prospectUrl}"}</code>
            </div>
          )}
        </>
      )}

      <div className="agent-editor-section-label" style={{ marginTop: 16 }}>Step configuration</div>
      <textarea className="agent-editor-prompt" rows={7} value={configText}
        aria-label="Step configuration JSON"
        onChange={(e) => setConfigText(e.target.value)} />
      {configError ? <div className="error-message" role="alert">{configError}</div> : null}

      {/* Error */}
      {result && !result.ok && result.error && (
        <div className="error-message" style={{ marginTop: 12 }}>
          <span>{result.error}</span>
        </div>
      )}

      {/* Gate: pending review */}
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

      {/* Results */}
      {items.length > 0 && (
        <div className="agent-results">
          <div className="agent-editor-section-label" style={{ marginTop: 16 }}>
            {items.length} {node.category === "gate" ? "staged for review" : "results"}
          </div>
          {items.map((item, i) => (
            <ProspectCard key={(item.id as string) ?? i} item={item} showDraft={showDraft} />
          ))}
        </div>
      )}

      {/* Measure node: show feedback edges info */}
      {node.category === "measure" && result?.ok && (
        <div className="recommendation" style={{ marginTop: 12 }}>
          <span>Outcome record</span>
          <p>This node stages attributable outcomes in the preserved run. Feedback edges remain visible as future learning relationships.</p>
        </div>
      )}

      <div className="node-action-row">
        <Button disabled={running} onClick={onRun} type="button">
          {running ? <LoaderCircle className="spin" /> : <Play />}
          {running ? "Running step…" : "Run this step"}
        </Button>
        <Button className="secondary-button" onClick={save} type="button">
          {saved ? <Check /> : <Save />}
          {saved ? "Saved" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}

// ─── Top-level NodeEditor ─────────────────────────────────────────────────────

export function NodeEditor({
  selection, graph, connectors, runResult, runningNodeId,
  onUpdateGraph, onRunNode, onApproveGate,
}: {
  selection: NodeSelection;
  graph: GTMGraph | null;
  connectors: ConnectorMeta[];
  runResult: GTMRunResult | null;
  runningNodeId: string | null;
  onUpdateGraph: (g: GTMGraph) => void;
  onRunNode: (nodeId: string) => void;
  onApproveGate: (nodeId: string) => void;
}) {
  if (!graph) return <div className="detail-empty"><p>No graph loaded.</p></div>;
  if (!selection) return <div className="detail-empty"><p>Click any node in the canvas to inspect or edit it.</p></div>;

  const node = graph.nodes.find((n) => n.id === selection);
  if (!node) return <div className="detail-empty"><p>Node not found.</p></div>;

  const result = runResult?.nodes[node.id];

  if (node.category === "resource") {
    return <ResourceEditor node={node} connectors={connectors} />;
  }
  if (node.category === "context") {
    return <ContextEditor node={node} graph={graph} onUpdate={onUpdateGraph} />;
  }
  return (
    <WorkNodeEditor
      key={selection}
      node={node} graph={graph}
      connectors={connectors} result={result}
      running={runningNodeId === node.id}
      onUpdate={onUpdateGraph}
      onRun={() => onRunNode(node.id)}
      onApprove={() => onApproveGate(node.id)}
    />
  );
}
