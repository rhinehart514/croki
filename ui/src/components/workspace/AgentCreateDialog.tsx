import { Dialog } from "@base-ui/react/dialog";
import { Bot, Plus, ShieldCheck, X } from "lucide-react";
import { useState } from "react";
import { putFirmConfiguration } from "@/api";
import type { FirmConfiguration, FirmConfiguredAgent } from "@/types";

function agentRef(name: string) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
}

export function AgentCreateDialog({ ventureId, configuration, initialName = "", readOnlyReason, onClose, onCreated }: {
  ventureId: string;
  configuration: FirmConfiguration;
  initialName?: string;
  readOnlyReason: string | null;
  onClose: () => void;
  onCreated: (agent: FirmConfiguredAgent, configuration: FirmConfiguration) => void;
}) {
  const [name, setName] = useState(initialName);
  const [purpose, setPurpose] = useState("");
  const [instructions, setInstructions] = useState("");
  const [provider, setProvider] = useState<"codex" | "claude-code">("codex");
  const [outwardEffects, setOutwardEffects] = useState<"blocked" | "wall">("wall");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = agentRef(name);
  const duplicate = configuration.agents.some((agent) => agent.ref === ref);
  const ready = Boolean(name.trim() && purpose.trim() && ref && !duplicate && !readOnlyReason && !busy);

  const submit = async () => {
    if (!ready) return;
    const agent: FirmConfiguredAgent = {
      ref,
      name: name.trim(),
      label: "Specialist",
      perspective: purpose.trim(),
      temperament: [],
      contributes: [],
      boundaries: [],
      activation: "direct",
      capabilities: { firmTools: true, additional: [] },
      context: {
        scope: "venture",
        instructions: instructions.trim() || `Work from ${name.trim()}'s stated purpose. Keep claims tied to this venture's truth and make uncertainty explicit.`,
      },
      memory: { scope: "venture-soul", instructions: "Remember durable corrections, decisions, and observed outcomes from this venture." },
      runtime: { provider, model: null },
      budget: { maxSteps: null, dailySpendUsd: null },
      authority: { outwardEffects },
      evaluation: { signals: [], instructions: null },
    };
    setBusy(true);
    setError(null);
    try {
      const result = await putFirmConfiguration(
        ventureId,
        configuration.revision,
        { ...configuration, agents: [...configuration.agents, agent] },
        `Created ${agent.name}`,
      );
      onCreated(result.configuration.agents.find((candidate) => candidate.ref === agent.ref) ?? agent, result.configuration);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The agent could not be created.");
    } finally {
      setBusy(false);
    }
  };

  return <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
    <Dialog.Portal><Dialog.Backdrop className="agent-purpose-backdrop" /><Dialog.Viewport className="agent-purpose-viewport">
      <Dialog.Popup className="workspace-dialog agent-create-dialog">
        <header><div><span>New specialist</span><Dialog.Title>Create an agent</Dialog.Title></div><Dialog.Close aria-label="Close agent creator"><X aria-hidden="true" /></Dialog.Close></header>
        <p className="workspace-dialog-note">This specialist appears in Canvas with a visible purpose, runtime, capabilities, authority, and workflow assignments. It does not replace the Claude or Codex model you talk to in this Thread.</p>
        <label><span>Name</span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Product strategist" /></label>
        <label><span>Purpose</span><textarea value={purpose} onChange={(event) => setPurpose(event.target.value)} placeholder="Develop the product mechanism and the decisions needed to prove it." /></label>
        <label><span>Standing context <small>Optional</small></span><textarea value={instructions} onChange={(event) => setInstructions(event.target.value)} placeholder="What this agent should consistently consider, protect, or refuse." /></label>
        <div className="agent-create-options">
          <label><span><Bot aria-hidden="true" /> Runtime</span><select value={provider} onChange={(event) => setProvider(event.target.value as "codex" | "claude-code")}><option value="codex">Codex</option><option value="claude-code">Claude</option></select></label>
          <label><span><ShieldCheck aria-hidden="true" /> Outward authority</span><select value={outwardEffects} onChange={(event) => setOutwardEffects(event.target.value as "blocked" | "wall")}><option value="wall">Prepare; wait for me</option><option value="blocked">Blocked</option></select></label>
        </div>
        {duplicate ? <p role="alert" className="agent-create-error">An agent with this identifier already exists. Use a more distinct name.</p> : null}
        {readOnlyReason ? <p role="status" className="agent-create-error">{readOnlyReason}</p> : null}
        {error ? <p role="alert" className="agent-create-error">{error}</p> : null}
        <footer><button type="button" onClick={onClose}>Cancel</button><button type="button" disabled={!ready} onClick={() => void submit()}><Plus aria-hidden="true" />{busy ? "Creating…" : "Create agent"}</button></footer>
      </Dialog.Popup>
    </Dialog.Viewport></Dialog.Portal>
  </Dialog.Root>;
}
