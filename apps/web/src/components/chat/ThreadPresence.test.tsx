import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import { ThreadId } from "@croki/contracts";

import { ThreadPresenceSummaryContent, ThreadTypingIndicatorContent } from "./ThreadPresence";

const alice = {
  participantId: "session-a:0",
  threadId: ThreadId.make("thread-1"),
  surface: "thread" as const,
  label: "Alice",
  deviceType: "desktop" as const,
  activity: "typing" as const,
  lastSeenAt: "2026-08-16T12:00:00.000Z",
  expiresAt: "2026-08-16T12:00:20.000Z",
};

describe("Thread presence presentation", () => {
  it("keeps the header and typing chrome absent when nobody else is present", () => {
    const markup = renderToStaticMarkup(
      <>
        <ThreadPresenceSummaryContent participants={[]} />
        <ThreadTypingIndicatorContent participants={[]} />
      </>,
    );

    expect(markup).toBe("");
  });

  it("renders compact identity and typing status without draft content", () => {
    const markup = renderToStaticMarkup(
      <>
        <ThreadPresenceSummaryContent participants={[alice]} />
        <ThreadTypingIndicatorContent participants={[alice]} />
      </>,
    );

    expect(markup).toContain("Alice here");
    expect(markup).toContain("Alice is typing");
    expect(markup).not.toContain("draft");
    expect(markup).not.toContain("prompt");
  });
});
