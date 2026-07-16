import { useState } from "react";
import { ArrowRight, Link2, Sparkles, X } from "lucide-react";
import type { ArchitectureRole, FirmArchitectureElement } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type AtlasMutationDraft =
  | { kind: "create"; point: { x: number; y: number } }
  | { kind: "promote"; element: FirmArchitectureElement }
  | { kind: "connect"; sourceId: string; targetId: string }
  | { kind: "campaign"; motion: FirmArchitectureElement };

const OPERATIONAL_ROLES: Array<{ role: Exclude<ArchitectureRole, "concept">; label: string; description: string }> = [
  { role: "system", label: "Reusable capability", description: "An ability several routes can share." },
];

export function ArchitectureMutationPreview({
  draft,
  busy,
  error,
  onCancel,
  onCreate,
  onPromote,
  onConnect,
  onStartCampaign,
}: {
  draft: AtlasMutationDraft;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onCreate: (name: string, point: { x: number; y: number }) => void;
  onPromote: (role: Exclude<ArchitectureRole, "concept">) => void;
  onConnect: (label: string) => void;
  onStartCampaign: (value: { name: string; audience: string; objective: string; uncertainty: string; observation: string; window: string }) => void;
}) {
  const [value, setValue] = useState("");
  const [campaign, setCampaign] = useState({ name: "", audience: "", objective: "", uncertainty: "", observation: "", window: "" });
  const campaignComplete = Object.values(campaign).every((entry) => entry.trim());
  return (
    <section className="atlas-mutation-preview" role="dialog" aria-modal="false" aria-label={draft.kind === "create" ? "Create a venture thought" : draft.kind === "connect" ? "Name this relationship" : draft.kind === "campaign" ? "Start a campaign" : "Use this thought in Drover"}>
      <header>
        <span aria-hidden="true">{draft.kind === "create" ? <Sparkles /> : draft.kind === "connect" ? <Link2 /> : <ArrowRight />}</span>
        <div>
          <small>{draft.kind === "create" ? "Place a thought" : draft.kind === "connect" ? "Tentative relationship" : draft.kind === "campaign" ? "Activate this route" : "Make operational"}</small>
          <strong>{draft.kind === "promote" ? draft.element.name : draft.kind === "campaign" ? draft.motion.name : draft.kind === "connect" ? "What does this connection mean?" : "What matters here?"}</strong>
        </div>
        <Button type="button" variant="ghost" size="icon-sm" onClick={onCancel} aria-label="Cancel architecture change"><X aria-hidden="true" /></Button>
      </header>
      {draft.kind === "campaign" ? (
        <form className="atlas-campaign-form" onSubmit={(event) => { event.preventDefault(); if (campaignComplete) onStartCampaign(campaign); }}>
          {([
            ["name", "Campaign name", "A bounded activation with a clear end"],
            ["audience", "Audience", "Who this route is for now"],
            ["objective", "Objective", "What should change"],
            ["uncertainty", "Governing uncertainty", "The claim Drover will explore"],
            ["observation", "What will we observe?", "A concrete returned behavior or condition"],
            ["window", "Observation boundary", "For example: first twenty accepted entries"],
          ] as const).map(([field, label, placeholder]) => <label key={field}><span>{label}</span><Input value={campaign[field]} onChange={(event) => setCampaign((current) => ({ ...current, [field]: event.target.value }))} placeholder={placeholder} /></label>)}
          <p>This creates one campaign inside “{draft.motion.name}” and one question to learn from. Nothing leaves without your hand.</p>
          <Button type="submit" disabled={!campaignComplete || busy}>Start campaign</Button>
        </form>
      ) : draft.kind === "promote" ? (
        <div className="atlas-role-choices">
          {OPERATIONAL_ROLES.map((choice) => (
            <button type="button" key={choice.role} disabled={busy} onClick={() => onPromote(choice.role)}>
              <strong>{choice.label}</strong><span>{choice.description}</span>
            </button>
          ))}
          <p>A thought can become a reusable capability directly. Product loops and routes need their actor-to-value contract; campaigns start from a selected route.</p>
        </div>
      ) : (
        <form onSubmit={(event) => {
          event.preventDefault();
          if (!value.trim()) return;
          if (draft.kind === "create") onCreate(value.trim(), draft.point);
          else onConnect(value.trim());
        }}>
          <Input autoFocus value={value} onChange={(event) => setValue(event.target.value)} placeholder={draft.kind === "create" ? "Name the thought…" : "may open the door to…"} aria-label={draft.kind === "create" ? "Thought name" : "Relationship label"} />
          <Button type="submit" disabled={!value.trim() || busy}>{draft.kind === "create" ? "Place thought" : "Keep relationship"}</Button>
          {draft.kind === "connect" ? <p>Until made structural through an operational role, this connection changes no execution.</p> : null}
        </form>
      )}
      {error ? <p className="atlas-mutation-error" role="alert">{error}</p> : null}
    </section>
  );
}
