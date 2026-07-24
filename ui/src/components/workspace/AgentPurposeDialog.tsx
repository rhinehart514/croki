import { Dialog } from "@base-ui/react/dialog";
import { Bot, Check, ShieldCheck, Sparkles, X } from "lucide-react";
import { motion } from "motion/react";
import { CrewFace } from "@/components/crew/CrewFace";
import { overlayMotion } from "@/lib/motion";
import type { FirmConfiguredAgent, FirmCrewMember } from "@/types";

function sentence(value: string | null | undefined, fallback: string) { return value?.trim() || fallback; }

export function AgentPurposeDialog({ member, agent, workflowNames, onClose, onWork }: {
  member: FirmCrewMember;
  agent: FirmConfiguredAgent | null;
  workflowNames: string[];
  onClose: () => void;
  onWork: (ref: string) => void;
}) {
  const name = member.soul?.name?.trim() || agent?.name || member.ref;
  const purpose = sentence(agent?.perspective, sentence(agent?.context.instructions, "A venture-scoped agent ready for a founder direction."));
  const tools = agent ? [...(agent.capabilities.firmTools ? ["Venture context"] : []), ...agent.capabilities.additional] : [];
  const runtime = [agent?.runtime.provider, agent?.runtime.model].filter(Boolean).join(" · ") || "Runtime follows venture defaults";
  return <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
    <Dialog.Portal><Dialog.Backdrop className="agent-purpose-backdrop" /><Dialog.Viewport className="agent-purpose-viewport">
      <Dialog.Popup render={<motion.section className="agent-purpose-dialog" {...overlayMotion} />}>
        <header className="agent-purpose-hero"><div className="agent-purpose-face"><CrewFace agentRef={member.ref} size={72} /><i aria-hidden="true"><Sparkles /></i></div><div><span>Agent</span><Dialog.Title>{name}</Dialog.Title><Dialog.Description>{purpose}</Dialog.Description></div><Dialog.Close className="agent-purpose-close" aria-label="Close agent details"><X /></Dialog.Close></header>
        <div className="agent-purpose-runtime"><Bot aria-hidden="true" /><span><small>Runtime</small><strong>{runtime}</strong></span><i>{agent?.activation === "watch" ? "Watching" : "Directed"}</i></div>
        <div className="agent-purpose-grid"><section><h3>What this agent can do</h3>{tools.length ? <ul>{tools.map((tool) => <li key={tool}><Check aria-hidden="true" />{tool}</li>)}</ul> : <p>No additional tools assigned. It works from the current venture context.</p>}</section><section><h3>Authority</h3><p className="agent-purpose-authority"><ShieldCheck aria-hidden="true" />{agent?.authority.outwardEffects === "wall" ? "Prepares outward work and stops for founder approval." : "Outward actions are blocked."}</p></section></div>
        <section className="agent-purpose-workflows"><h3>Active in workflows</h3>{workflowNames.length ? <ul>{workflowNames.map((workflow) => <li key={workflow}>{workflow}</li>)}</ul> : <p>Not assigned yet. Drag {name} onto an Agent Work step.</p>}</section>
        <footer><p>Drag this agent from the rail to compose a workflow.</p><button type="button" onClick={() => { onClose(); onWork(member.ref); }}>Work with {name}</button></footer>
      </Dialog.Popup>
    </Dialog.Viewport></Dialog.Portal>
  </Dialog.Root>;
}
