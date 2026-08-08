import {
  EventId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type OrchestrationReadModel,
  type OrchestrationThreadActivity,
} from "@croki/contracts";
import { describe, expect, it } from "vite-plus/test";

import { projectActivityPayload, projectReadModelSnapshot } from "./ActivityPayloadProjection.ts";

const now = "2026-07-30T00:00:00.000Z";

function activity(payload: Record<string, unknown>): OrchestrationThreadActivity {
  return {
    id: EventId.make("activity-1"),
    tone: "tool",
    kind: "tool.completed",
    summary: "Tool",
    payload,
    turnId: null,
    createdAt: now,
  } as OrchestrationThreadActivity;
}

function makeReadModelWithActivity(
  activity: OrchestrationReadModel["threads"][number]["activities"][number],
): OrchestrationReadModel {
  const projectId = ProjectId.make("project-croki");
  const modelSelection = {
    instanceId: ProviderInstanceId.make("codex"),
    model: "gpt-5.6",
  };
  return {
    snapshotSequence: 1,
    updatedAt: now,
    projects: [
      {
        id: projectId,
        title: "Croki",
        workspaceRoot: "/projects/croki",
        defaultModelSelection: modelSelection,
        scripts: [],
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      },
    ],
    threads: [
      {
        id: ThreadId.make("thread-croki"),
        projectId,
        title: "Canvas",
        modelSelection,
        interactionMode: "default",
        runtimeMode: "full-access",
        branch: null,
        worktreePath: "/projects/croki-worktree",
        latestTurn: null,
        createdAt: now,
        updatedAt: now,
        archivedAt: null,
        settledOverride: null,
        settledAt: null,
        deletedAt: null,
        messages: [],
        proposedPlans: [],
        activities: [activity],
        checkpoints: [],
        session: null,
      },
    ],
  };
}

describe("projectActivityPayload", () => {
  it("keeps Canvas receipts while removing rendered context", () => {
    const receipt = {
      status: "loaded",
      relativePath: ".croki/context.json",
      version: 1,
      sha256: "a".repeat(64),
      updatedAt: "2026-07-30T00:00:00.000Z",
      activeCount: 2,
      currentCount: 1,
      provisionalCount: 1,
      renderedChars: 123,
      truncated: false,
      harnessId: "gtm-v1",
    };
    const projected = projectActivityPayload({
      id: EventId.make("event-croki-context"),
      tone: "info",
      kind: "croki.context.applied",
      summary: "Applied Canvas context",
      payload: {
        sourceEventId: "source-event",
        messageId: "message-1",
        prompt: "private product context",
        receipt,
      },
      turnId: null,
      createdAt: now,
    });

    expect(projected.payload).toEqual({
      messageId: "message-1",
      receipt,
    });
    expect(JSON.stringify(projected)).not.toContain("private product context");
    expect(JSON.stringify(projected)).not.toContain("source-event");
  });

  it("redacts Canvas prompts from full read-model snapshots", () => {
    const snapshot = makeReadModelWithActivity({
      id: EventId.make("event-croki-context-snapshot"),
      tone: "info",
      kind: "croki.context.applied",
      summary: "Applied Canvas context",
      payload: {
        messageId: "message-1",
        prompt: "private product context",
        receipt: { status: "loaded" },
      },
      turnId: null,
      createdAt: now,
    });

    const projected = projectReadModelSnapshot(snapshot);

    expect(projected.threads[0]?.activities[0]?.payload).toEqual({
      messageId: "message-1",
      receipt: { status: "loaded" },
    });
    expect(JSON.stringify(projected)).not.toContain("private product context");
  });

  it("slims Codex-shaped mcp_tool_call items to rendered fields plus a result summary", () => {
    const projected = projectActivityPayload(
      activity({
        itemType: "mcp_tool_call",
        data: {
          item: {
            type: "mcpToolCall",
            id: "item-1",
            tool: "fetch_pr",
            server: "github",
            status: "completed",
            arguments: { pr: 42 },
            durationMs: 1200,
            result: {
              content: [{ type: "text", text: `PR body line one\n${"x".repeat(5000)}` }],
              structuredContent: { huge: "y".repeat(5000) },
            },
            _meta: { internal: true },
          },
        },
      }),
    );
    const data = (projected.payload as Record<string, unknown>).data as Record<string, unknown>;
    const item = data.item as Record<string, unknown>;
    expect(item.tool).toBe("fetch_pr");
    expect(item.server).toBe("github");
    expect(item.arguments).toEqual({ pr: 42 });
    expect(item._meta).toBeUndefined();
    expect(item.result).toEqual({ content: "PR body line one" });
    expect(JSON.stringify(projected.payload).length).toBeLessThan(500);
  });

  it("slims Claude-shaped mcp_tool_call data (toolName/input/result block)", () => {
    const projected = projectActivityPayload(
      activity({
        itemType: "mcp_tool_call",
        data: {
          toolName: "mcp__github__fetch_pr",
          input: { pr: 42 },
          result: {
            type: "tool_result",
            tool_use_id: "toolu_1",
            content: [{ type: "text", text: `first line of output\n${"z".repeat(5000)}` }],
          },
        },
      }),
    );
    const data = (projected.payload as Record<string, unknown>).data as Record<string, unknown>;
    expect(data.toolName).toBe("mcp__github__fetch_pr");
    expect(data.input).toEqual({ pr: 42 });
    expect(data.result).toEqual({ content: "first line of output" });
    expect(JSON.stringify(projected.payload).length).toBeLessThan(500);
  });

  it("passes task lifecycle payloads (no data field) through untouched", () => {
    const source = activity({
      taskId: "task-9",
      title: "Audit auth",
      role: "explorer",
      model: "opus",
      effort: "high",
      workflowName: "audit-flow",
      phases: [{ index: 0, title: "Audit" }],
      typedUsage: { totalTokens: 1200 },
      runHandles: { runId: "run-1", scriptPath: "/tmp/wf.js" },
      timelineBypass: true,
    });
    const projected = projectActivityPayload(source);
    expect(projected.payload).toEqual(source.payload);
  });
});
