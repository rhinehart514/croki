// Version-tolerant decoding and founder-safe shaping for Codex app-server JSONL.

export function buildCodexAppServerArgs({ mcpUrl = null, nativeCoding = false } = {}) {
  return [
    "app-server",
    "--listen", "stdio://",
    ...(nativeCoding ? [
      "-c", 'approval_policy="never"',
      "-c", "sandbox_workspace_write.network_access=true",
      "-c", "features.network_proxy.enabled=true",
      "-c", 'features.network_proxy.domains={ "localhost" = "allow", "127.0.0.1" = "allow" }',
      "-c", "features.network_proxy.allow_local_binding=true",
      "-c", "features.network_proxy.allow_upstream_proxy=false",
    ] : []),
    ...(mcpUrl ? ["-c", `mcp_servers.drover.url=${JSON.stringify(mcpUrl)}`] : []),
  ];
}

export function parseCodexAppServerMessage(line) {
  try {
    const message = typeof line === "string" ? JSON.parse(line) : line;
    return message && typeof message === "object" && !Array.isArray(message) ? message : null;
  } catch {
    return null;
  }
}

function nestedStatus(value) {
  if (value === "pendingInit" || value === "notLoaded") return "pending";
  if (value === "running" || value === "inProgress" || value === "active") return "running";
  if (value === "completed" || value === "shutdown" || value === "idle") return "completed";
  if (value === "interrupted") return "interrupted";
  if (value === "errored" || value === "failed" || value === "notFound" || value === "systemError") return "failed";
  return null;
}

function nestedAction(tool) {
  if (tool === "spawnAgent") return "spawn";
  if (tool === "sendInput") return "message";
  if (tool === "resumeAgent") return "resume";
  if (tool === "wait") return "wait";
  if (tool === "closeAgent") return "close";
  return "delegate";
}

function boundedLabel(thread) {
  const label = thread?.agentNickname || thread?.agentRole || "Agent";
  return String(label).trim().slice(0, 120) || "Agent";
}

// Collaboration prompts and child messages remain provider machinery. Croki receives only identity,
// lifecycle, selected model, and action so the Run can explain work without exposing hidden prose.
export function decodeCodexAppServerNotification(message) {
  if (!message?.method || !message.params) return [];
  const { method, params } = message;
  const item = params.item ?? null;
  if (method === "thread/started" && params.thread?.parentThreadId) {
    return [{
      type: "nested-work",
      provider: "codex",
      id: params.thread.id,
      parentId: params.thread.parentThreadId,
      action: "agent",
      status: nestedStatus(params.thread.status?.type) ?? "pending",
      label: boundedLabel(params.thread),
    }];
  }
  if (method === "thread/status/changed") {
    return [{
      type: "session-status",
      provider: "codex",
      id: params.threadId,
      status: nestedStatus(params.status?.type),
      waitingOn: Array.isArray(params.status?.activeFlags) ? params.status.activeFlags.slice(0, 8) : [],
    }];
  }
  if ((method === "item/started" || method === "item/completed") && item?.type === "collabAgentToolCall") {
    const states = item.agentsStates && typeof item.agentsStates === "object" ? item.agentsStates : {};
    const childIds = Array.isArray(item.receiverThreadIds) ? item.receiverThreadIds.filter(Boolean) : [];
    return [{
      type: "nested-work",
      provider: "codex",
      id: item.id,
      parentId: item.senderThreadId ?? params.threadId ?? null,
      action: nestedAction(item.tool),
      status: nestedStatus(item.status) ?? (method === "item/started" ? "running" : "completed"),
      children: childIds.map((id) => ({ id, status: nestedStatus(states[id]?.status) })),
      model: item.model ?? null,
      effort: item.reasoningEffort ?? null,
    }];
  }
  if ((method === "item/started" || method === "item/completed") && item?.type === "subAgentActivity") {
    return [{
      type: "nested-work",
      provider: "codex",
      id: item.id,
      parentId: params.threadId ?? null,
      action: item.kind === "started" ? "agent" : item.kind,
      status: item.kind === "interrupted" ? "interrupted" : (method === "item/completed" ? "completed" : "running"),
      children: item.agentThreadId ? [{ id: item.agentThreadId, status: null }] : [],
    }];
  }
  return [];
}

const TERMINAL_NESTED = new Set(["completed", "failed", "stopped"]);

function childStatus(event, child = null) {
  const status = child?.status ?? event.status ?? "running";
  if (status === "interrupted") return "stopped";
  if (event.action === "close" && !child?.status) return "completed";
  return status;
}

// A Codex child thread is the durable nested-task identity. Collaboration tool-call ids are
// transient operations over that child and never become a competing worker identity in Croki.
export function createCodexNestedTaskProjection({
  onNestedTask = null,
  getRootThreadId = () => null,
} = {}) {
  const tasks = new Map();
  const publish = (event, child = null) => {
    const taskId = child?.id ?? event.id;
    if (!taskId) return null;
    const prior = tasks.get(taskId);
    const status = childStatus(event, child);
    const terminal = TERMINAL_NESTED.has(status);
    const parentId = event.parentId && event.parentId !== getRootThreadId()
      ? event.parentId
      : prior?.parentTaskId ?? null;
    const shaped = {
      kind: terminal ? "settled" : prior ? "progress" : "started",
      taskId,
      status,
      description: event.label ?? prior?.description ?? "Agent",
      taskKind: "agent",
      ...(parentId ? { parentTaskId: parentId } : {}),
      ...(event.model ?? prior?.model ? { model: event.model ?? prior.model } : {}),
      ...(event.effort ?? prior?.effort ? { effort: event.effort ?? prior.effort } : {}),
    };
    tasks.set(taskId, shaped);
    try {
      onNestedTask?.({
        ...shaped,
        activeCount: [...tasks.values()].filter((task) => !TERMINAL_NESTED.has(task.status)).length,
      });
    } catch { /* live projection errors never break the provider turn */ }
    return shaped;
  };
  return {
    tasks,
    dispatch(event) {
      if (event?.type !== "nested-work") return [];
      if (event.action === "status" || event.action === "agent") return [publish(event)].filter(Boolean);
      const children = Array.isArray(event.children) ? event.children : [];
      return children.map((child) => publish(event, child)).filter(Boolean);
    },
    settleUnfinished() {
      for (const task of [...tasks.values()]) {
        if (TERMINAL_NESTED.has(task.status)) continue;
        publish({
          type: "nested-work",
          id: task.taskId,
          parentId: task.parentTaskId ?? null,
          action: "status",
          status: "stopped",
          label: task.description,
        });
      }
    },
  };
}

export function codexAppServerInput(prompt, images) {
  return [
    { type: "text", text: String(prompt ?? ""), text_elements: [] },
    ...(Array.isArray(images) ? images : []).filter(Boolean).map((image) => ({
      type: "localImage",
      path: String(image),
    })),
  ];
}

export function codexAppServerUsage(params) {
  const usage = params?.tokenUsage?.last;
  if (!usage || typeof usage !== "object") return null;
  const result = {
    inputTokens: Number(usage.inputTokens) || 0,
    outputTokens: Number(usage.outputTokens) || 0,
    cacheReadInputTokens: Number(usage.cachedInputTokens) || 0,
    cacheCreationInputTokens: Number(usage.cacheWriteInputTokens) || 0,
  };
  return Object.values(result).some((value) => value > 0) ? result : null;
}

export function codexAppServerFileChanges(item) {
  const passed = item?.status === "completed";
  return (Array.isArray(item?.changes) ? item.changes : []).filter((change) => change?.path).map((change) => {
    const kind = change.kind?.type;
    const detail = passed
      ? (kind === "add" ? "Added" : kind === "delete" ? "Deleted" : kind === "update" ? "Updated" : "Changed")
      : "Failed";
    return {
      toolUseId: item.id ?? null,
      name: "apply_patch",
      target: String(change.path),
      status: passed ? "passed" : "failed",
      detail,
      ...(passed ? { source: { path: String(change.path) } } : {}),
    };
  });
}
