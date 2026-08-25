// @effect-diagnostics nodeBuiltinImport:off
import { describe, expect, it } from "vite-plus/test";
import * as NodeChildProcess from "node:child_process";
import * as NodeProcess from "node:process";

import {
  countSourceLines,
  containsAutomaticServerModelInput,
  extractImportSpecifiers,
  findBrandPolicyViolations,
  findRequiredBrandSurfaceViolations,
  findUnretainedT3Identifiers,
  isArchivedStandaloneImport,
  isCrokiModelOrServicePath,
  isCrokiOwnedPath,
  resolveOverlayBase,
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

  it("allows only the exact persisted legacy theme identifiers", () => {
    for (const themeId of [
      "t3-chat",
      "t3-chat-dark",
      "t3-ember",
      "t3-grove",
      "t3-iris",
      "t3-ocean",
    ]) {
      expect(findUnretainedT3Identifiers(themeId)).toEqual([]);
    }
    expect(findUnretainedT3Identifiers("T3 Chat")).toEqual(["T3 Chat"]);
    expect(findUnretainedT3Identifiers("theme:t3-grove")).toEqual(["t3-grove"]);
    expect(findUnretainedT3Identifiers("t3-new-theme")).toEqual(["t3-new-theme"]);
  });

  it("rejects automatic Croki context and harness input at the server boundary", () => {
    const reactorPath = "apps/server/src/orchestration/Layers/ProviderCommandReactor.ts";
    expect(
      containsAutomaticServerModelInput(
        reactorPath,
        'const input = normalizedInput; import { loadCrokiApplication } from "./CrokiApplication";',
      ),
    ).toBe(true);
    expect(
      containsAutomaticServerModelInput(
        "apps/server/src/orchestration/Layers/CrokiContext.ts",
        "export const CROKI_PRODUCT_HARNESS_INSTRUCTION = `<croki_product_harness>`;",
      ),
    ).toBe(true);
    expect(
      containsAutomaticServerModelInput(
        reactorPath,
        "return { input: normalizedInput, attachments: normalizedAttachments };",
      ),
    ).toBe(false);
    expect(
      containsAutomaticServerModelInput(
        "apps/server/src/mcp/toolkits/application/handlers.ts",
        "const loaded = yield* loadCrokiApplication(workspaceRoot);",
      ),
    ).toBe(false);
  });

  it("treats an explicit overlay base as authoritative", () => {
    const expected = NodeChildProcess.execFileSync("git", ["rev-parse", "HEAD^{commit}"], {
      cwd: NodeProcess.cwd(),
      encoding: "utf8",
    }).trim();
    expect(resolveOverlayBase(NodeProcess.cwd(), "HEAD")).toBe(expected);
    expect(() => resolveOverlayBase(NodeProcess.cwd(), "definitely-not-a-commit")).toThrow(
      /explicit Croki overlay base/u,
    );
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

  it("requires Croki branding on the persistent sidebar surface", () => {
    const path = "apps/web/src/components/sidebar/SidebarChrome.tsx";
    expect(
      findRequiredBrandSurfaceViolations(
        path,
        'import { APP_BASE_NAME } from "../../branding"; <CrokiMark /> {APP_BASE_NAME}',
      ),
    ).toEqual([]);
    expect(findRequiredBrandSurfaceViolations(path, '<T3Wordmark aria-label="T3" /> Code')).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "required-brand-surface", path })]),
    );
  });

  it("rejects inherited copy on a required Croki surface", () => {
    const path = "apps/web/src/components/settings/SettingsFontPreviews.tsx";
    expect(findRequiredBrandSurfaceViolations(path, 'const prompt = "t3code";')).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "required-brand-surface", path })]),
    );
    expect(findRequiredBrandSurfaceViolations(path, 'const prompt = "croki";')).toEqual([]);
  });
});
