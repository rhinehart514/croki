import {
  CheckpointRef,
  EventId,
  type OrchestrationCheckpointSummary,
  type OrchestrationThreadActivity,
  TurnId,
} from "@croki/contracts";
import { describe, expect, it } from "vite-plus/test";

import { deriveUiCheckReceipts, isLikelyUserVisibleFile } from "./uiCheckReceipt";

const turnId = TurnId.make("turn-ui");

function checkedScreen(input: {
  id: string;
  observedAt: string;
  width?: number;
  consoleErrorCount?: number;
  networkFailureCount?: number;
}): OrchestrationThreadActivity {
  const attachmentId = `thread-ui-00000000-0000-4000-8000-00000000000${input.id}`;
  return {
    id: EventId.make(`activity-${input.id}`),
    kind: "preview.snapshot",
    tone: "info",
    summary: `Checked screen ${input.id}`,
    payload: {
      version: 1,
      entry: {
        id: `screen-${input.id}`,
        attachmentId,
        url: `http://localhost:5173/${input.id}`,
        title: `Screen ${input.id}`,
        observedAt: input.observedAt,
        width: input.width ?? 1_280,
        height: 800,
        interactiveElementCount: 4,
        consoleErrorCount: input.consoleErrorCount ?? 0,
        networkFailureCount: input.networkFailureCount ?? 0,
        actionCount: 1,
      },
      frame: {
        kind: "attachment",
        ref: attachmentId,
        mimeType: "image/png",
        width: input.width ?? 1_280,
        height: 800,
      },
    },
    turnId,
    createdAt: input.observedAt,
  };
}

function checkpoint(input: {
  status?: OrchestrationCheckpointSummary["status"];
  files: ReadonlyArray<string>;
  completedAt?: string;
}): OrchestrationCheckpointSummary {
  return {
    turnId,
    checkpointTurnCount: 1,
    checkpointRef: CheckpointRef.make("checkpoint-1"),
    status: input.status ?? "ready",
    files: input.files.map((path) => ({
      path,
      kind: "modified",
      additions: 1,
      deletions: 0,
    })),
    assistantMessageId: null,
    completedAt: input.completedAt ?? "2026-08-05T12:00:05.000Z",
  };
}

describe("UI check receipts", () => {
  it("collapses checked screens from one turn into one result", () => {
    const receipts = deriveUiCheckReceipts(
      [
        checkedScreen({ id: "1", observedAt: "2026-08-05T12:00:02.000Z" }),
        checkedScreen({
          id: "2",
          observedAt: "2026-08-05T12:00:04.000Z",
          width: 390,
          consoleErrorCount: 1,
        }),
      ],
      [checkpoint({ files: ["apps/web/src/components/Settings.tsx"] })],
    );

    expect(receipts).toHaveLength(1);
    expect(receipts[0]).toMatchObject({
      status: "checked",
      createdAt: "2026-08-05T12:00:05.000Z",
      issueCount: 1,
      visibleFiles: ["apps/web/src/components/Settings.tsx"],
    });
    expect(receipts[0]?.screens.map((screen) => screen.width)).toEqual([1_280, 390]);
  });

  it("reports visible changes without rendered evidence as not checked", () => {
    expect(
      deriveUiCheckReceipts([], [checkpoint({ files: ["apps/web/src/styles/settings.css"] })]),
    ).toMatchObject([
      {
        status: "not-checked",
        screens: [],
        visibleFiles: ["apps/web/src/styles/settings.css"],
      },
    ]);
  });

  it("reports an incomplete checkpoint as unavailable instead of checked", () => {
    expect(
      deriveUiCheckReceipts(
        [],
        [checkpoint({ status: "error", files: ["apps/mobile/SettingsView.swift"] })],
      ),
    ).toMatchObject([{ status: "unavailable", screens: [] }]);
  });

  it("does not add verification ceremony to nonvisual work", () => {
    expect(
      deriveUiCheckReceipts(
        [],
        [
          checkpoint({
            files: [
              "apps/server/src/auth.ts",
              "docs/README.md",
              "apps/web/src/components/Settings.test.tsx",
            ],
          }),
        ],
      ),
    ).toEqual([]);
  });

  it("still records a deliberate checked screen when the turn changed no visible files", () => {
    const receipts = deriveUiCheckReceipts(
      [checkedScreen({ id: "1", observedAt: "2026-08-05T12:00:02.000Z" })],
      [checkpoint({ files: ["apps/server/src/auth.ts"] })],
    );

    expect(receipts).toMatchObject([{ status: "checked", visibleFiles: [] }]);
  });
});

describe("visible file hints", () => {
  it("recognizes rendered sources and assets across common UI stacks", () => {
    expect(isLikelyUserVisibleFile("apps/web/src/App.tsx")).toBe(true);
    expect(isLikelyUserVisibleFile("apps/desktop/styles.css")).toBe(true);
    expect(isLikelyUserVisibleFile("ios/SettingsView.swift")).toBe(true);
    expect(isLikelyUserVisibleFile("lib/screens/settings_screen.dart")).toBe(true);
    expect(isLikelyUserVisibleFile("android/app/src/main/res/layout/settings.xml")).toBe(true);
    expect(isLikelyUserVisibleFile("public/hero.webp")).toBe(true);
  });

  it("ignores tests, fixtures, stories, documentation, and server modules", () => {
    expect(isLikelyUserVisibleFile("apps/web/src/App.test.tsx")).toBe(false);
    expect(isLikelyUserVisibleFile("apps/web/src/__tests__/App.tsx")).toBe(false);
    expect(isLikelyUserVisibleFile("apps/web/src/App.stories.tsx")).toBe(false);
    expect(isLikelyUserVisibleFile("docs/design.md")).toBe(false);
    expect(isLikelyUserVisibleFile("apps/server/src/auth.ts")).toBe(false);
    expect(isLikelyUserVisibleFile("ios/Networking.swift")).toBe(false);
    expect(isLikelyUserVisibleFile("lib/services/auth_service.dart")).toBe(false);
  });
});
