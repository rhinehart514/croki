import type { FounderCredential } from "@/api";
import type { FirmConfiguredAgent } from "@/types";

export type WorkflowCapability = {
  id: string;
  label: string;
  provider: string;
  authority: "read" | "inward" | "founder-gate";
  detail: string;
};

const BUILT_INS: WorkflowCapability[] = [
  { id: "browser", label: "Browser", provider: "native", authority: "read", detail: "Inspect and research on the web" },
  { id: "repository", label: "Repository", provider: "native", authority: "inward", detail: "Read and change isolated product work" },
];

function title(value: string) {
  return value.split(/[-_\s]+/).filter(Boolean).map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" ");
}

export function workflowCapabilities(credentials: FounderCredential[], agents: FirmConfiguredAgent[] = []) {
  const capabilities = [...BUILT_INS];
  for (const credential of credentials) {
    if (!credential.hasToken) continue;
    if (credential.provider === "gmail") {
      capabilities.push(
        { id: "gmail.read", label: "Gmail Read", provider: "gmail", authority: "read", detail: credential.accountAddress ?? "Observe replies and evidence" },
        { id: "gmail.send", label: "Gmail Send", provider: "gmail", authority: "founder-gate", detail: "Prepare email; founder approves every send" },
      );
      continue;
    }
    const label = credential.label?.trim() || `${title(credential.provider)} API`;
    capabilities.push({ id: `${credential.provider}.api`, label, provider: credential.provider, authority: "read", detail: "Connected founder credential" });
  }
  for (const capability of agents.flatMap((agent) => agent.capabilities.additional)) {
    const id = capability.trim().toLowerCase();
    if (id && !capabilities.some((entry) => entry.id === id)) capabilities.push({ id, label: title(capability), provider: "agent", authority: "inward", detail: "Available through configured agent tools" });
  }
  return capabilities;
}
