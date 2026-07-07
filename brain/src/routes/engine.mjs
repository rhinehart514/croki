// Derived-state reads over the agent roster and engine: per-agent taste profile, the Measure engine
// state, the assembled context substrate, the agent bench, and the on-disk library. Moved verbatim out
// of server.mjs. All read-only and derived from real signals — never seeded, never gating a run.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { json, listLibraryAgents } from "./util.mjs";
import { getEngineState } from "../engine.mjs";
import { getAgentProfile, getAgentBench, getChannel, loadProject } from "../project-store.mjs";
import { loadFlow } from "../flow-store.mjs";
import { listConnectors } from "../connectors/registry.mjs";
import { getWorkspace, listWorkspaces } from "../workspace.mjs";
import { assembleContext } from "../context/assembler.mjs";
import { providersFromContext } from "../context/providers.mjs";
import { extractDecisions, buildDraftMemory } from "../memory.mjs";
import { ideaTasteForProject } from "../feedback-ledger.mjs";
import { getProductModel } from "../product-model-store.mjs";
import { getDesignState } from "../design-state-store.mjs";

export default async function handle({ req, res, url }) {
  // Per-agent taste profile — the "how it learned" panel behind an agent's face. DERIVED-ONLY from
  // this project's run ledger: how many runs the agent produced items in, the founder's approve/reject/
  // edit counts on those items, the last few before/after edits (the strongest learning signal), and a
  // rendered current-voice summary. An agent the founder has never run reads honestly ("no runs yet"),
  // never a fabricated zero. Read-only.
  const agentProfileMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/agents\/([^/]+)\/profile$/);
  if (req.method === "GET" && agentProfileMatch) {
    try {
      const projectId = decodeURIComponent(agentProfileMatch[1]);
      const agentRef = decodeURIComponent(agentProfileMatch[2]);
      json(res, 200, { profile: getAgentProfile(projectId, agentRef) });
    } catch (err) {
      json(res, 500, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  // GTM Engine OS — the Measure subsystem is derived from the active workspace's
  // scanned win event + the default channel's run ledger + live connector state.
  // Scope to a specific workspace with ?workspace=<id>; otherwise the most
  // recently updated workspace is the active outcome.
  if (req.method === "GET" && url.pathname === "/api/engine") {
    try {
      const requested = url.searchParams.get("workspace");
      const summaries = listWorkspaces();
      const target = requested
        ? summaries.find((w) => w.id === requested)
        : summaries[0];
      let report = null;
      if (target) {
        try { report = getWorkspace(target.id).report ?? null; } catch { report = null; }
      }
      const project = loadProject();
      const requestedChannel = url.searchParams.get("channel") || project.activeChannelId;
      let graphId = requestedChannel;
      try { graphId = getChannel(project, requestedChannel).graphId; } catch { /* legacy graph id */ }
      const { graph, runs } = graphId ? loadFlow(graphId, null) : { graph: null, runs: [] };
      json(res, 200, { engine: getEngineState({ report, runs, graph, connectors: listConnectors() }) });
    } catch (err) {
      json(res, 500, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  // The context substrate, made visible. Assembles what the model would actually receive for a
  // channel — the multiplier — and returns the manifest so the UI can show it always, not just
  // after a run. Same providers the live agent calls use (agent-bridge), so the pill never lies.
  if (req.method === "GET" && url.pathname === "/api/context") {
    try {
      const project = loadProject();
      const requestedChannel = url.searchParams.get("channel") || project.activeChannelId;
      let graphId = requestedChannel;
      try { graphId = getChannel(project, requestedChannel).graphId; } catch { /* legacy graph id */ }
      const { runs } = graphId ? loadFlow(graphId, null) : { runs: [] };

      // Product grounding from the durable workspace scan when present, else the shared-context
      // repository facts. evidenceState stays conservatively "blind" unless the scan proves it.
      const repo = project.sharedContext?.repository ?? {};
      let report = null;
      const ws = listWorkspaces()[0];
      if (ws) { try { report = getWorkspace(ws.id).report ?? null; } catch { report = null; } }
      const grounding = repo.repo ? {
        productName: project.name || "product",
        headline: repo.headline || report?.headline || "",
        winEvent: repo.outcome ? { name: repo.outcome } : (report?.winEvent ?? null),
        stack: report?.stack ?? [],
        evidenceState: report?.winEvent?.found ? "proven" : "blind",
        evidence: Array.isArray(repo.evidence) ? repo.evidence : (report?.winEvent?.citations ?? []),
        blindSpots: (report?.gaps ?? []).map((g) => ({ title: g.title })),
      } : null;

      const memory = buildDraftMemory(extractDecisions(runs), { ideaTaste: ideaTasteForProject(project.id) });
      // The editable interpretation rides alongside the cited grounding. The product-model provider
      // emits the founder-editable shape (things/relationships/goals/states + pinned signals); the
      // product provider keeps emitting cited truth. Both run — they answer different questions.
      const productModel = getProductModel(project.id) ?? null;
      const providers = providersFromContext({ grounding, productModel, __memory: memory, __state: runs, designState: getDesignState(project.id) });
      const assembled = assembleContext({ providers, intent: `assemble context for channel ${requestedChannel}` });
      json(res, 200, { channelId: requestedChannel, manifest: assembled.manifest, text: assembled.text });
    } catch (err) {
      json(res, 500, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  // The agent bench — the whole roster as ONE lens over the run ledger: every on-disk agent with its
  // real, derived track record (runs, approvals, rejections). A never-run agent reads honestly ("no
  // runs yet"), never a seeded number. Mirrors the board route: read-only, derived, never gates a run.
  const benchMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/bench$/);
  if (req.method === "GET" && benchMatch) {
    try {
      const projectId = decodeURIComponent(benchMatch[1]);
      json(res, 200, { bench: getAgentBench(projectId, { agents: listLibraryAgents() }) });
    } catch (err) {
      json(res, 500, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  // The library — the real artifacts of GTM engineering on disk (subagents and skills), so the
  // explorer can show the parts of the system, not just channels. Read-only listing; names plus
  // the one-line description from each file's frontmatter.
  if (req.method === "GET" && url.pathname === "/api/library") {
    try {
      const home = os.homedir();
      const firstDescription = (text) => {
        const m = text.match(/^description:\s*(.+)$/m);
        return m ? m[1].trim().replace(/^["']|["']$/g, "").slice(0, 160) : "";
      };
      const skillsDir = path.join(home, ".claude", "skills");
      const agents = listLibraryAgents();
      let skills = [];
      try {
        skills = fs.readdirSync(skillsDir, { withFileTypes: true })
          .filter((d) => d.isDirectory() && !d.name.startsWith("."))
          .filter((d) => fs.existsSync(path.join(skillsDir, d.name, "SKILL.md")))
          .map((d) => {
            let description = "";
            try { description = firstDescription(fs.readFileSync(path.join(skillsDir, d.name, "SKILL.md"), "utf8")); } catch { /* name only */ }
            return { name: d.name, description };
          })
          .sort((a, b) => a.name.localeCompare(b.name));
      } catch { /* no skills dir */ }
      json(res, 200, { agents, skills });
    } catch (err) {
      json(res, 500, { error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  }

  return false;
}
