import { describe, expect, it } from "vite-plus/test";

import {
  countSourceLines,
  extractImportSpecifiers,
  findBrandPolicyViolations,
  findUnretainedT3Identifiers,
  isArchivedStandaloneImport,
  isCrokiModelOrServicePath,
  isCrokiOwnedPath,
} from "./check-croki-overlay.ts";

describe("check-croki-overlay", () => {
  it("counts source lines without treating the final newline as another line", () => {
    expect(countSourceLines("")).toBe(0);
    expect(countSourceLines("one\n")).toBe(1);
    expect(countSourceLines("one\r\ntwo\r\n")).toBe(2);
  });

  it("keeps ownership scoped to explicit Croki additions", () => {
    expect(isCrokiOwnedPath("apps/web/src/components/croki/CrokiCanvas.tsx")).toBe(true);
    expect(isCrokiOwnedPath("scripts/lib/brand-policy.ts")).toBe(true);
    expect(isCrokiOwnedPath("apps/web/src/components/ChatView.tsx")).toBe(false);
    expect(isCrokiOwnedPath("AGENTS.md")).toBe(false);
  });

  it("limits only Croki model and service sources", () => {
    expect(isCrokiModelOrServicePath("packages/shared/src/crokiContext.ts")).toBe(true);
    expect(isCrokiModelOrServicePath("apps/server/src/orchestration/Layers/CrokiContext.ts")).toBe(
      true,
    );
    expect(
      isCrokiModelOrServicePath("apps/web/src/components/croki/crokiCanvasDraftStore.ts"),
    ).toBe(true);
    expect(
      isCrokiModelOrServicePath("apps/mobile/src/features/croki/crokiCanvasPresentation.ts"),
    ).toBe(true);
    expect(
      isCrokiModelOrServicePath("apps/web/src/components/croki/crokiCanvasModel.test.ts"),
    ).toBe(false);
    expect(isCrokiModelOrServicePath("apps/server/src/server.ts")).toBe(false);
  });

  it("finds archived standalone imports without blocking inherited T3 runtime imports", () => {
    const imports = extractImportSpecifiers(`
      import { useAtomCommand } from "@croki/client-runtime/state/runtime";
      import { Brain } from "../../../brain";
      const relay = await import("../relay/client");
      const historical = require("/archive/croki-transition-archive/runtime");
    `);
    expect(imports).toEqual([
      "@croki/client-runtime/state/runtime",
      "../../../brain",
      "../relay/client",
      "/archive/croki-transition-archive/runtime",
    ]);
    expect(imports.map(isArchivedStandaloneImport)).toEqual([false, true, true, true]);
  });

  it("accepts Croki identifiers and rejects unknown legacy identifiers", () => {
    expect(findUnretainedT3Identifiers("croki-dev")).toEqual([]);
    expect(findUnretainedT3Identifiers("com.croki.desktop.preview")).toEqual([]);
    expect(findUnretainedT3Identifiers("https://latest.app.t3.codes")).toEqual([]);
    expect(findUnretainedT3Identifiers("Croki desktop build")).toEqual([]);
    expect(findUnretainedT3Identifiers("t3surprise")).toEqual(["t3surprise"]);
  });

  it("checks only added production brand literals", () => {
    expect(
      findBrandPolicyViolations([
        { path: "apps/web/src/branding.ts", line: 'const name = "Croki";' },
        { path: "apps/web/src/storage.ts", line: 'const key = "croki:theme";' },
        { path: "apps/web/src/inherited.ts", line: "const untouched = true;" },
        { path: "apps/web/src/branding.test.ts", line: 'expect(name).toBe("Croki");' },
      ]),
    ).toEqual([]);
  });
});
