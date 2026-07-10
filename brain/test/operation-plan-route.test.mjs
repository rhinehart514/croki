import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "operation-plan-route-"));
process.env.GTM_IDE_HOME = HOME;
process.env.GTM_IDE_PERSISTENCE = "json";

const { operationPlanForProject, projectScan } = await import("../src/routes/operation-plan.mjs");

after(() => fs.rmSync(HOME, { recursive: true, force: true }));

describe("operation-plan terrain compatibility route", () => {
  it("resolves only the project's linked workspace", () => {
    const calls = [];
    const project = { id: "project-b", sharedContext: { repository: { workspaceId: "workspace-b" } } };
    const result = projectScan(project, (id) => {
      calls.push(id);
      return { id, report: { repo: "/repo/b", scannedAt: "2026-07-10T10:00:00.000Z" } };
    });
    assert.deepEqual(calls, ["workspace-b"]);
    assert.equal(result.report.repo, "/repo/b");
    assert.equal(result.scannedAt, "2026-07-10T10:00:00.000Z");
  });

  it("passes requested provider selection and project-scoped scan into the terrain planner", async () => {
    let factoryOptions;
    let plannerInput;
    const project = {
      id: "project-b",
      name: "Product B",
      sharedContext: {
        goal: "Find product leverage",
        repository: { workspaceId: "workspace-b", repo: "/repo/b", outcome: "signup_completed" },
      },
    };
    const report = {
      scannedAt: "2026-07-10T10:00:00.000Z",
      productContext: { pkg: { name: "product-b", description: "The B product" } },
      winEvent: { name: "signup_completed", found: true, citations: [{ file: "src/b.ts", line: 7 }] },
      gaps: [],
    };
    const response = await operationPlanForProject(
      project,
      new URL("http://localhost/api/operation-plan?runtime=codex&model=gpt-test&goal=Read%20B"),
      {
        workspaceReader: (id) => {
          assert.equal(id, "workspace-b");
          return { id, repo: "/repo/b", report };
        },
        plannerFactory: (options) => {
          factoryOptions = options;
          return async (input) => {
            plannerInput = input;
            return {
              ok: true,
              plan: { motions: [], span: {}, generatedAt: "2026-07-10T11:00:00.000Z", scannedAt: input.scannedAt },
              meta: { provider: "codex" },
            };
          };
        },
        productModelReader: () => null,
        capabilityReader: () => ({ tools: [], agents: [] }),
      },
    );

    assert.equal(factoryOptions.cwd, "/repo/b");
    assert.equal(factoryOptions.runtime, "codex");
    assert.equal(factoryOptions.model, "gpt-test");
    assert.equal(plannerInput.projectId, "project-b");
    assert.equal(plannerInput.scan, report);
    assert.equal(plannerInput.grounding.winEvent.name, "signup_completed");
    assert.equal(plannerInput.goal, "Read B");
    assert.equal(response.meta.provider, "codex");
    assert.equal(response.plan.stale, false);
  });
});
