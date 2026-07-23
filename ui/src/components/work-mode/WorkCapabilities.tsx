import { useEffect, useState } from "react";
import { getCapabilityInventory, getCredentials, type FounderCredential, type RuntimeCapabilityInventoryItem } from "@/api";
import { CapabilityLogo } from "@/components/workspace/CapabilityLogo";
import { workflowCapabilities, type WorkflowCapability } from "@/components/workspace/workflowCapabilities";
import { CAPABILITY_KINDS, authorityLabel, statusLabel } from "@/components/workspace/capabilityPresentation";

// The connected reach of the coding agent, made legible in Work. Product / GTM already renders capabilities
// as logo-led pills; Work showed only a static "Guarded" chip, which named the boundary without naming what
// the agent can actually touch. This surfaces the real inventory the host reports — the same source the
// Product / GTM rail reads — so the founder can see which tools, sources, and gated actions Claude/Codex can
// reach, each pill naming its kind (Tool / Source / Action / Workspace) and authority (Read / Inward /
// Approval) in words, never by logo or colour alone. It never grants or configures; it reflects.
const MAX_PILLS = 6;

// Coding-relevant reach, richest first: the isolated workspace, then callable tools, then sources it can
// read, then gated actions. Agent-skill entries the host cannot actually call are left to Product / GTM.
const KIND_RANK: Record<WorkflowCapability["kind"], number> = {
  workspace: 0, tool: 1, source: 2, action: 3, markdown: 4, "agent-skill": 5,
};
const STATUS_RANK: Record<WorkflowCapability["status"], number> = { available: 0, reconnect: 1, unavailable: 2 };

function codingCapabilities(inventory: RuntimeCapabilityInventoryItem[], credentials: FounderCredential[]) {
  return workflowCapabilities(credentials, [], inventory)
    .filter((capability) => capability.status !== "unavailable" && capability.kind !== "agent-skill")
    .sort((left, right) => STATUS_RANK[left.status] - STATUS_RANK[right.status]
      || KIND_RANK[left.kind] - KIND_RANK[right.kind]
      || left.label.localeCompare(right.label))
    .slice(0, MAX_PILLS);
}

export function WorkCapabilities() {
  const [capabilities, setCapabilities] = useState<WorkflowCapability[] | null>(null);
  useEffect(() => {
    let live = true;
    Promise.all([getCapabilityInventory(), getCredentials().catch(() => ({ credentials: [] }))])
      .then(([inventory, credentials]) => {
        if (live) setCapabilities(codingCapabilities(inventory.capabilities, credentials.credentials));
      })
      .catch(() => { if (live) setCapabilities([]); });
    return () => { live = false; };
  }, []);

  // Until the host answers, stay quiet rather than flash a placeholder; the repo/worktree chips beside this
  // strip already carry the resting truth.
  if (!capabilities || !capabilities.length) return null;

  return (
    <div className="work-capability-strip" aria-label="Connected capabilities the coding agent can reach">
      {capabilities.map((capability) => {
        const kind = CAPABILITY_KINDS[capability.kind];
        const status = statusLabel(capability);
        return (
          <span
            key={capability.id}
            className="work-capability-pill"
            data-authority={capability.authority}
            data-status={capability.status}
            title={`${capability.detail}${status ? ` · ${status}` : ""}`}
            aria-label={`${capability.label}, ${kind}, ${authorityLabel(capability)} access${status ? `, ${status}` : ""}`}
          >
            <CapabilityLogo capability={capability} size={18} />
            <span className="work-capability-name">{capability.label}</span>
            <small className="work-capability-kind">{kind}</small>
            <i className="work-capability-authority">{authorityLabel(capability)}</i>
          </span>
        );
      })}
    </div>
  );
}
