"use client";

import { ChevronDownIcon, RefreshCwIcon } from "lucide-react";
import { useMemo, useState } from "react";
import type { OpenClawAgent, ServerProvider } from "@croki/contracts";

import { cn } from "../../lib/utils";
import { DraftInput } from "../ui/draft-input";
import {
  Combobox,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxPopup,
  ComboboxTrigger,
} from "../ui/combobox";

export interface OpenClawAgentPickerProps {
  readonly value: unknown;
  readonly liveProvider: ServerProvider | undefined;
  readonly idPrefix: string;
  readonly variant: "card" | "dialog";
  readonly onChange: (nextConfig: Record<string, unknown> | undefined) => void;
}

function readConfigObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function readAgentId(value: unknown): string {
  if (value === null || typeof value !== "object") return "";
  const candidate = (value as Record<string, unknown>).agentId;
  return typeof candidate === "string" ? candidate.trim() : "";
}

export function updateOpenClawAgentId(
  value: unknown,
  agentId: string,
): Record<string, unknown> | undefined {
  const next = readConfigObject(value);
  const trimmed = agentId.trim();
  if (trimmed.length === 0) {
    delete next.agentId;
  } else {
    next.agentId = trimmed;
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

/**
 * Keep the native default at the top while preserving the provider's order
 * for the remaining agents. The server already normalizes this list, but the
 * client keeps this helper defensive for older snapshots and custom bridges.
 */
export function deriveOpenClawAgents(
  provider: ServerProvider | undefined,
): ReadonlyArray<OpenClawAgent> {
  const agents = provider?.openClawAgents ?? [];
  return agents
    .filter(
      (agent, index, all) => all.findIndex((candidate) => candidate.id === agent.id) === index,
    )
    .toSorted((left, right) => Number(right.isDefault) - Number(left.isDefault));
}

export function getOpenClawAgentStatus(
  provider: ServerProvider | undefined,
  agentCount: number,
  configuredAgentId = "",
) {
  if (provider === undefined) {
    return {
      label: "Waiting for provider check",
      className: "text-muted-foreground",
      detail: "Refresh provider status to discover local agents.",
    };
  }
  if (provider.status === "error") {
    return {
      label: "Discovery unavailable",
      className: "text-destructive",
      detail: provider.message ?? "OpenClaw did not return an agent inventory.",
    };
  }
  if (provider.status === "warning") {
    return {
      label: "Checking OpenClaw",
      className: "text-warning",
      detail: provider.message ?? "Agent discovery is still running.",
    };
  }
  if (agentCount === 0) {
    if (configuredAgentId.length > 0) {
      return {
        label: "Custom agent configured",
        className: "text-emerald-500",
        detail: "Using the explicit agent ID. Native discovery is unavailable for this setup.",
      };
    }
    return {
      label: "No agents discovered",
      className: "text-warning",
      detail: "Enter an agent ID manually for a remote or custom setup.",
    };
  }
  return {
    label: `${agentCount} agent${agentCount === 1 ? "" : "s"} discovered`,
    className: "text-emerald-500",
    detail: "Select a configured OpenClaw agent or enter a custom ID below.",
  };
}

function agentDetail(agent: OpenClawAgent): string {
  const details = [agent.model, agent.workspace].filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
  return details.length > 0 ? details.join(" · ") : "Native OpenClaw configuration";
}

export function OpenClawAgentPicker({
  value,
  liveProvider,
  idPrefix,
  variant,
  onChange,
}: OpenClawAgentPickerProps) {
  const [query, setQuery] = useState("");
  const configuredAgentId = readAgentId(value);
  const agents = useMemo(() => deriveOpenClawAgents(liveProvider), [liveProvider]);
  const selectedAgent = agents.find((agent) => agent.id === configuredAgentId);
  const defaultAgent = agents.find((agent) => agent.isDefault);
  const effectiveAgent = selectedAgent ?? defaultAgent;
  const filteredAgents = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (normalizedQuery.length === 0) return agents;
    return agents.filter((agent) =>
      [agent.id, agent.name, agent.model, agent.workspace]
        .filter((value): value is string => typeof value === "string")
        .some((value) => value.toLowerCase().includes(normalizedQuery)),
    );
  }, [agents, query]);
  const status = getOpenClawAgentStatus(liveProvider, agents.length, configuredAgentId);
  const inputId = `${idPrefix}-agentId`;
  const selectedValue = selectedAgent?.id ?? null;
  const triggerLabel =
    (selectedAgent?.name ?? configuredAgentId) || effectiveAgent?.name || "Choose an agent";

  const setAgentId = (agentId: string) => onChange(updateOpenClawAgentId(value, agentId));

  return (
    <div
      className={cn(
        "grid gap-2",
        variant === "card" ? "" : "rounded-md border border-border/70 p-3",
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <span className="text-xs font-medium text-foreground">OpenClaw agent</span>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Keep the agent's native model, workspace, memory, and skills.
          </p>
        </div>
        <span
          className={cn("shrink-0 text-[10px] font-medium", status.className)}
          role="status"
          aria-live="polite"
        >
          {status.label}
        </span>
      </div>

      {agents.length > 0 ? (
        <Combobox
          items={agents.map((agent) => agent.id)}
          filteredItems={filteredAgents.map((agent) => agent.id)}
          value={selectedValue}
          onValueChange={(next) => {
            if (next) setAgentId(next);
          }}
          onOpenChange={(open) => {
            if (!open) setQuery("");
          }}
        >
          <ComboboxTrigger
            className="flex min-h-9 w-full items-center justify-between gap-3 rounded-md border border-input bg-background px-3 py-1.5 text-left text-sm outline-none hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Select OpenClaw agent"
          >
            <span className="min-w-0">
              <span className="block truncate font-medium text-foreground">{triggerLabel}</span>
              <span className="block truncate font-mono text-[10px] text-muted-foreground">
                {(selectedAgent?.id ?? configuredAgentId) ||
                  (effectiveAgent
                    ? `${effectiveAgent.id} · native default`
                    : "Enter an agent ID below")}
              </span>
            </span>
            <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          </ComboboxTrigger>
          <ComboboxPopup className="w-[min(28rem,calc(100vw-2rem))] overflow-hidden">
            <div className="border-b border-border/70 p-2">
              <ComboboxInput
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search agents..."
                showTrigger={false}
                size="sm"
              />
            </div>
            <ComboboxEmpty>No matching OpenClaw agents.</ComboboxEmpty>
            <ComboboxList className="max-h-72">
              {filteredAgents.map((agent) => (
                <ComboboxItem key={agent.id} value={agent.id} className="min-h-12 py-2">
                  <div className="grid min-w-0 gap-0.5">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-medium">{agent.name}</span>
                      {agent.isDefault ? (
                        <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-primary">
                          Default
                        </span>
                      ) : null}
                    </div>
                    <code className="truncate text-[10px] text-muted-foreground">{agent.id}</code>
                    <span className="truncate text-[11px] text-muted-foreground">
                      {agentDetail(agent)}
                    </span>
                  </div>
                </ComboboxItem>
              ))}
            </ComboboxList>
          </ComboboxPopup>
        </Combobox>
      ) : null}

      <label htmlFor={inputId} className="grid gap-1">
        <span className="text-[11px] font-medium text-foreground">Manual agent ID</span>
        <DraftInput
          id={inputId}
          value={configuredAgentId}
          onCommit={setAgentId}
          placeholder={effectiveAgent?.id ?? "your-agent-id"}
          spellCheck={false}
        />
        <span
          className={cn(
            "text-[11px]",
            status.className === "text-destructive" ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {status.detail}
        </span>
      </label>

      {liveProvider?.status === "error" ? (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <RefreshCwIcon className="size-3 shrink-0" aria-hidden />
          <span>
            Use the provider refresh control after fixing OpenClaw, then choose from discovered
            agents.
          </span>
        </div>
      ) : null}
    </div>
  );
}
