import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";

import { UiHistoryActivityPayload, UiHistoryInput } from "./uiHistory.ts";

const decodeActivityPayload = Schema.decodeUnknownSync(UiHistoryActivityPayload);
const decodeInput = Schema.decodeUnknownSync(UiHistoryInput);

describe("UI history contracts", () => {
  it("accepts a bounded checked-screen activity", () => {
    const payload = decodeActivityPayload({
      version: 1,
      entry: {
        id: "screen-1",
        attachmentId: "thread-1-00000000-0000-4000-8000-000000000001",
        url: "http://localhost:5173/settings",
        title: "Settings",
        observedAt: "2026-08-05T12:00:00.000Z",
        width: 1_280,
        height: 800,
        interactiveElementCount: 12,
        consoleErrorCount: 0,
        networkFailureCount: 1,
        actionCount: 4,
      },
      frame: {
        kind: "attachment",
        ref: "thread-1-00000000-0000-4000-8000-000000000001",
        mimeType: "image/png",
        width: 1_280,
        height: 800,
      },
    });

    expect(payload.entry.title).toBe("Settings");
    expect(payload.frame.kind).toBe("attachment");
  });

  it("bounds list requests", () => {
    expect(() => decodeInput({ limit: 26 })).toThrow();
    expect(decodeInput({ limit: 10 })).toEqual({ limit: 10 });
  });
});
