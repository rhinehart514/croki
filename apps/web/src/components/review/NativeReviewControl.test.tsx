import { EnvironmentId, ThreadId } from "@croki/contracts";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("../../state/review", () => ({
  reviewEnvironment: { startNative: Symbol("startNative") },
}));
vi.mock("../../state/use-atom-command", () => ({
  useAtomCommand: () => vi.fn(),
}));
vi.mock("../ui/tooltip", () => ({
  Tooltip: ({ children }: { readonly children: ReactNode }) => children,
  TooltipTrigger: ({ render }: { readonly render: ReactNode }) => render,
  TooltipPopup: ({ children }: { readonly children: ReactNode }) => <span>{children}</span>,
}));

import { NativeReviewControl } from "./NativeReviewControl";

const threadRef = {
  environmentId: EnvironmentId.make("env-test"),
  threadId: ThreadId.make("thread-test"),
};

describe("NativeReviewControl", () => {
  it("names Codex as the review provider and explains detached delivery", () => {
    const markup = renderToStaticMarkup(
      <NativeReviewControl threadRef={threadRef} target={{ type: "uncommittedChanges" }} />,
    );

    expect(markup).toContain("Run Codex review");
    expect(markup).toContain("native read-only review in a child Thread");
    expect(markup).not.toContain(' disabled=""');
  });

  it("keeps unsupported review scopes visible but disabled", () => {
    const markup = renderToStaticMarkup(
      <NativeReviewControl threadRef={threadRef} target={null} />,
    );

    expect(markup).toContain("Run Codex review");
    expect(markup).toContain("Codex review supports Working tree and Branch changes.");
    expect(markup).toContain(' disabled=""');
  });
});
