import { describe, expect, it } from "vitest";
import type { WallQueueItemView } from "@/api";
import type { FirmBet, FirmConfiguration, FirmOutcome } from "@/types";
import { projectDive } from "./diveProjection";

const configuration: FirmConfiguration = {
  id: "firm-1", schemaVersion: 1, revision: 3,
  presentation: { participant: "teammate", participantLabel: "Teammate", collectiveLabel: "Teammates" },
  defaults: { runtime: null, model: null, maxSteps: 8 },
  organization: { shape: "open", instructions: null, relationships: [] },
  coordination: { mode: "direct", coordinatorRef: null, protocols: [], stopWhen: [] },
  authority: { outwardEffects: "wall", configurationChanges: "founder" },
  agents: [{
    ref: "mira", name: "Mira", label: null, perspective: null, activation: "direct",
    capabilities: { firmTools: true, additional: [] }, context: { scope: "venture", instructions: null },
    memory: { scope: "venture", instructions: null }, runtime: { provider: null, model: null },
    budget: { maxSteps: null, dailySpendUsd: null }, authority: { outwardEffects: "wall" },
    evaluation: { signals: [], instructions: null },
  }],
};

const bet: FirmBet = {
  id: "bet-1", ventureId: "venture-1", intent: "Test a founder-signed note.", forkedFrom: null,
  teammateRef: "mira", configurationRevision: 3, refs: [], evidence: [],
  staged: [{ id: "note-1", title: "Founder-signed note", content: "Exact held message", ownerRefs: ["mira"], stagedAt: "2026-07-15T14:02:00Z" }],
  joinKey: "join-1", createdAt: "2026-07-15T14:00:00Z", updatedAt: "2026-07-15T14:02:00Z",
  endedAt: null, endedBy: null, learning: null, position: "at-wall", stagedCount: 1, latestOutcome: null,
  events: [{ id: "event-1", type: "started", detail: "Read the cited product truth", at: "2026-07-15T14:01:00Z" }],
  workflow: [
    { id: "bet-1:opened:opened", label: "Opened", kind: "opened", state: "done", at: "2026-07-15T14:00:00Z", teammateRef: "mira" },
    { id: "bet-1:event:event-1", label: "Read the cited product truth", kind: "event", state: "done", at: "2026-07-15T14:01:00Z", eventId: "event-1", teammateRef: "mira", durationMs: 22 },
    { id: "bet-1:staged:note-1", label: "Founder-signed note", kind: "staged", state: "done", at: "2026-07-15T14:02:00Z", workRef: "note-1", teammateRef: "mira" },
    { id: "bet-1:wall:wall-1", label: "Release", kind: "gate", state: "gate", at: "2026-07-15T14:03:00Z", workRef: "note-1", teammateRef: "mira" },
    { id: "bet-1:outcome:outcome-1", label: "Show me more.", kind: "outcome", state: "done", at: "2026-07-15T14:04:00Z", workRef: "note-1" },
  ],
  machineryCounts: [{ label: "events", count: 1 }, { label: "staged", count: 1 }, { label: "at wall", count: 1 }, { label: "outcomes", count: 1 }],
};

const wall: WallQueueItemView = {
  id: "wall-1", ventureId: "venture-1", betId: "bet-1", workRef: "note-1", purpose: "release",
  blocksBet: true, effect: { kind: "send", subject: "A useful note", body: "Exact held message", to: "buyer@example.com" },
  parkedAt: "2026-07-15T14:03:00Z", decision: null,
};

const outcome: FirmOutcome = {
  type: "outcome", id: "outcome-1", betId: "bet-1", workRef: "note-1", outcomeKind: "reply",
  from: "buyer@example.com", body: "Show me more.", source: "provider", channel: "email",
  observedAt: "2026-07-15T14:04:00Z", joined: true,
};

describe("projectDive", () => {
  it("projects only durable records and their explicit lineage", () => {
    const projection = projectDive({ bet, wallItems: [wall], outcomes: [outcome], configuration });
    expect(projection.nodes.map((node) => node.kind)).toEqual(["bet", "event", "work", "gate", "outcome"]);
    expect(projection.nodes.find((node) => node.kind === "work")?.teammateNames).toEqual(["Mira"]);
    expect(projection.nodes.find((node) => node.kind === "gate")?.review?.details).toContainEqual(expect.objectContaining({ label: "Exact act", value: "Exact held message" }));
    expect(projection.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: "work:note-1", target: "gate:wall-1", label: "exact work held" }),
      expect.objectContaining({ source: "work:note-1", target: "outcome:outcome-1", label: "exact work returned" }),
    ]));
    expect(projection.nodes.find((node) => node.kind === "event")?.receipts).toContainEqual({ label: "Duration", value: "22 ms" });
    expect(projection.nodes.some((node) => node.state === "running")).toBe(false);
    expect(projection.gaps).toEqual([]);
  });

  it("does not project records from another bet or a decided wall act", () => {
    const projection = projectDive({
      bet: { ...bet, workflow: bet.workflow?.filter((stage) => stage.kind !== "gate" && stage.kind !== "outcome") },
      wallItems: [{ ...wall, decision: "release" }, { ...wall, id: "other-wall", betId: "other-bet" }],
      outcomes: [{ ...outcome, id: "other-outcome", betId: "other-bet" }],
      configuration,
    });
    expect(projection.nodes.some((node) => node.kind === "gate")).toBe(false);
    expect(projection.nodes.some((node) => node.kind === "outcome")).toBe(false);
    expect(projection.gaps.join(" ")).toMatch(/no outward act is waiting for you/i);
  });

  it("places live presence and attributable receipts on only the exact running stage", () => {
    const running = {
      ...bet,
      workflow: bet.workflow?.map((stage) => stage.eventId === "event-1"
        ? { ...stage, state: "running" as const, runningTeammateRef: "mira", since: "2026-07-15T14:01:30Z", costUsd: 0.17 }
        : stage),
    };
    const projection = projectDive({ bet: running, wallItems: [wall], outcomes: [outcome], configuration });
    const active = projection.nodes.find((node) => node.state === "running")!;
    expect(active.runningTeammateNames).toEqual(["Mira"]);
    expect(active.runningSince).toBe("2026-07-15T14:01:30Z");
    expect(active.receipts).toEqual(expect.arrayContaining([
      { label: "Duration", value: "22 ms" },
      { label: "Run cost", value: "$0.17" },
    ]));
    expect(projection.nodes.filter((node) => node.runningTeammateNames.length)).toHaveLength(1);
  });

  it("centers an opening-only bet as an explicit evidence gap", () => {
    const projection = projectDive({
      bet: { ...bet, position: "live", staged: [], stagedCount: 0, events: [], workflow: [] },
      wallItems: [],
      outcomes: [],
      configuration,
    });
    expect(projection.nodes).toHaveLength(1);
    expect(projection.nodes[0]).toMatchObject({ kind: "bet", x: 320, y: 260 });
    expect(projection.width).toBe(640);
    expect(projection.gaps.join(" ")).toMatch(/no evidence has been recorded/i);
  });
});
