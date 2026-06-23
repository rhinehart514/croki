import { useMemo, useState } from "react";
import {
  Bot, Check, ChevronRight, Code2, FileSpreadsheet, Globe2, LoaderCircle, RotateCcw,
  ShieldCheck, Sparkles, X,
} from "lucide-react";
import type { DataAdapter, GTMOpportunity, OpportunityStatus, OpportunityStudio as Studio } from "@/types";

function DecisionButtons({
  status,
  onDecision,
}: {
  status: OpportunityStatus;
  onDecision: (status: OpportunityStatus) => void;
}) {
  return (
    <div className="opportunity-decisions" aria-label="Opportunity decision">
      <button className={status === "accepted" ? "active accept" : ""} onClick={() => onDecision("accepted")} type="button"><Check /> Accept</button>
      <button className={status === "deferred" ? "active" : ""} onClick={() => onDecision("deferred")} type="button"><RotateCcw /> Later</button>
      <button className={status === "rejected" ? "active reject" : ""} onClick={() => onDecision("rejected")} type="button"><X /> Reject</button>
    </div>
  );
}

function OpportunityCard({
  item,
  selected,
  onSelect,
  onUpdate,
}: {
  item: GTMOpportunity;
  selected?: boolean;
  onSelect?: () => void;
  onUpdate: (patch: Partial<GTMOpportunity>) => void | Promise<void>;
}) {
  return (
    <article className={`opportunity-card ${item.status} ${selected ? "selected" : ""}`}>
      <header>
        <span className={`opportunity-kind ${item.type}`}>
          {item.type === "agent" ? <Bot /> : <Sparkles />}
          {item.type}
        </span>
        <span className={`opportunity-origin ${item.origin}`}>{item.origin === "derived" ? "Code-derived" : "Strategic bet"}</span>
        <span className={`opportunity-confidence ${item.confidence}`}>{item.confidence} confidence</span>
      </header>
      <button className="opportunity-title" onClick={onSelect} type="button">
        <span><strong>{item.title}</strong><small>{item.objective}</small></span>
        {onSelect ? <ChevronRight /> : null}
      </button>
      <p>{item.rationale}</p>
      {item.evidence.length ? (
        <div className="opportunity-evidence">
          <Code2 />
          {item.evidence.slice(0, 2).map((citation) => (
            <span key={`${citation.file}-${citation.line}`}>{citation.file}:{citation.line}</span>
          ))}
        </div>
      ) : (
        <div className="opportunity-evidence speculative"><Sparkles /> No code claim; founder judgment required.</div>
      )}
      {item.type === "agent" ? (
        <div className="agent-runtime-choice">
          <label>
            Runtime
            <select value={item.provider || "claude"} onChange={(event) => void onUpdate({ provider: event.target.value as "claude" | "codex" })}>
              <option value="claude">Claude</option>
              <option value="codex">Codex</option>
            </select>
          </label>
          <label>
            Agent ref
            <input value={item.ref || ""} onChange={(event) => void onUpdate({ ref: event.target.value })} />
          </label>
        </div>
      ) : null}
      <DecisionButtons status={item.status} onDecision={(status) => void onUpdate({ status })} />
    </article>
  );
}

export function OpportunityStudio({
  studio,
  busy,
  onGenerate,
  onUpdate,
  onCompose,
}: {
  studio: Studio;
  busy: boolean;
  onGenerate: () => void | Promise<void>;
  onUpdate: (opportunityId: string, patch: Partial<GTMOpportunity>) => void | Promise<void>;
  onCompose: (input: {
    channelOpportunityId: string;
    agentOpportunityIds: string[];
    input: DataAdapter;
    output: DataAdapter;
  }) => void | Promise<void>;
}) {
  const channels = studio.items.filter((item) => item.type === "channel");
  const agents = studio.items.filter((item) => item.type === "agent");
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null);
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [inputType, setInputType] = useState<DataAdapter["type"]>("manual");
  const [inputCsv, setInputCsv] = useState("");
  const [inputEndpoint, setInputEndpoint] = useState("");
  const [outputType, setOutputType] = useState<"manual" | "api">("manual");
  const [outputEndpoint, setOutputEndpoint] = useState("");

  const effectiveChannelId = selectedChannelId && channels.some((item) => item.id === selectedChannelId && item.status === "accepted")
    ? selectedChannelId
    : channels.find((item) => item.status === "accepted")?.id ?? null;
  const selectedChannel = channels.find((item) => item.id === effectiveChannelId) ?? null;
  const acceptedAgents = agents.filter((item) => item.status === "accepted");
  const effectiveSelectedAgents = selectedAgents.filter((id) => acceptedAgents.some((agent) => agent.id === id));
  const compositionReady = !!selectedChannel && selectedChannel.status === "accepted"
    && (inputType !== "api" || /^https?:\/\//i.test(inputEndpoint))
    && (outputType !== "api" || /^https?:\/\//i.test(outputEndpoint));
  const counts = useMemo(() => ({
    derived: studio.items.filter((item) => item.origin === "derived").length,
    speculative: studio.items.filter((item) => item.origin === "speculative").length,
    accepted: studio.items.filter((item) => item.status === "accepted").length,
  }), [studio.items]);

  return (
    <section className="opportunity-studio" aria-labelledby="opportunity-title">
      <header className="studio-page-head">
        <div>
          <span className="studio-eyebrow">Opportunity studio</span>
          <h1 id="opportunity-title">Review what this product could run</h1>
          <p>{counts.derived} code-derived opportunities · {counts.speculative} strategic bets · {counts.accepted} accepted</p>
        </div>
        <button className="studio-secondary-action" disabled={busy} onClick={() => void onGenerate()} type="button">
          {busy ? <LoaderCircle className="spin" /> : <RotateCcw />} Regenerate
        </button>
      </header>

      <div className="opportunity-layout">
        <div className="opportunity-lists">
          <section>
            <header className="opportunity-section-head"><Sparkles /><strong>Channel opportunities</strong><span>Choose the motions worth building.</span></header>
            <div className="opportunity-grid">
              {channels.map((item) => (
                <OpportunityCard
                  item={item}
                  key={item.id}
                  selected={item.id === effectiveChannelId}
                  onSelect={() => setSelectedChannelId(item.id)}
                  onUpdate={(patch) => onUpdate(item.id, patch)}
                />
              ))}
            </div>
          </section>
          <section>
            <header className="opportunity-section-head"><Bot /><strong>Agent opportunities</strong><span>Reusable judgment steps that can run on Claude or Codex.</span></header>
            <div className="opportunity-grid">
              {agents.map((item) => (
                <div className="agent-opportunity-wrap" key={item.id}>
                  {item.status === "accepted" ? (
                    <label className="agent-use-toggle">
                      <input
                        checked={effectiveSelectedAgents.includes(item.id)}
                        onChange={(event) => setSelectedAgents((current) => event.target.checked
                          ? [...new Set([...current, item.id])]
                          : current.filter((id) => id !== item.id))}
                        type="checkbox"
                      />
                      Use in composed channel
                    </label>
                  ) : null}
                  <OpportunityCard item={item} onUpdate={(patch) => onUpdate(item.id, patch)} />
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className="composition-review" aria-label="Composition review">
          <span className="studio-eyebrow">Composition review</span>
          <h2>{selectedChannel?.title || "Accept a channel to compose it"}</h2>
          <p>{selectedChannel?.objective || "The workflow is only created after founder review."}</p>

          <div className="adapter-section">
            <strong>Input</strong>
            <div className="adapter-options">
              {(["manual", "csv", "api"] as const).map((type) => (
                <button className={inputType === type ? "active" : ""} key={type} onClick={() => setInputType(type)} type="button">
                  {type === "manual" ? <FileSpreadsheet /> : type === "csv" ? <FileSpreadsheet /> : <Globe2 />}
                  {type === "manual" ? "Manual" : type.toUpperCase()}
                </button>
              ))}
            </div>
            {inputType === "csv" ? (
              <label className="adapter-field">
                CSV file
                <input
                  accept=".csv,text/csv"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (file) setInputCsv(await file.text());
                  }}
                  type="file"
                />
                <small>{inputCsv ? `${inputCsv.split(/\r?\n/).filter(Boolean).length - 1} data rows loaded locally` : "The file remains in the local GTM IDE state."}</small>
              </label>
            ) : null}
            {inputType === "api" ? (
              <label className="adapter-field">API endpoint<input value={inputEndpoint} onChange={(event) => setInputEndpoint(event.target.value)} placeholder="https://api.example.com/items" /></label>
            ) : null}
          </div>

          <div className="workflow-preview">
            <span>Input</span><ChevronRight />
            <span>{effectiveSelectedAgents.length ? `${effectiveSelectedAgents.length} agents` : "No agents"}</span><ChevronRight />
            <span className="gate"><ShieldCheck /> Founder gate</span><ChevronRight />
            <span>Output</span><ChevronRight />
            <span>Measure</span>
            <div className="feedback-return">Observed outcomes return to product and input context.</div>
          </div>

          <div className="adapter-section">
            <strong>Output</strong>
            <div className="adapter-options">
              <button className={outputType === "manual" ? "active" : ""} onClick={() => setOutputType("manual")} type="button"><FileSpreadsheet /> Manual queue</button>
              <button className={outputType === "api" ? "active" : ""} onClick={() => setOutputType("api")} type="button"><Globe2 /> API</button>
            </div>
            {outputType === "api" ? (
              <label className="adapter-field">Gated API endpoint<input value={outputEndpoint} onChange={(event) => setOutputEndpoint(event.target.value)} placeholder="https://api.example.com/actions" /></label>
            ) : null}
          </div>

          <button
            className="studio-primary-action compose-action"
            disabled={!compositionReady || busy}
            onClick={() => selectedChannel && void onCompose({
              channelOpportunityId: selectedChannel.id,
              agentOpportunityIds: effectiveSelectedAgents,
              input: inputType === "csv"
                ? { type: "csv", label: "CSV input", csv: inputCsv }
                : inputType === "api"
                  ? { type: "api", label: "API input", endpoint: inputEndpoint, method: "GET" }
                  : { type: "manual", label: "Manual input", items: [] },
              output: outputType === "api"
                ? { type: "api", label: "Gated API output", endpoint: outputEndpoint }
                : { type: "manual", label: "Manual output queue" },
            })}
            type="button"
          >
            {busy ? <LoaderCircle className="spin" /> : <Sparkles />} Compose selected channel
          </button>
        </aside>
      </div>
    </section>
  );
}
