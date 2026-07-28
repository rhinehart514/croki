import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DecisionGate } from "./DecisionGate";
import type { WallQueueItemView } from "@/api";

/** @pierre/diffs renders each file body into a <diffs-container> shadow root. */
function diffBodyText(): string {
  return [...document.querySelectorAll("diffs-container")]
    .map((node) => node.shadowRoot?.textContent ?? "")
    .join("\n");
}

const productChange: WallQueueItemView = {
  id: "wall-1", ventureId: "v1", betId: "b1", purpose: "release", blocksBet: false,
  parkedAt: "2026-07-15T10:00:00Z", decision: null,
  effect: {
    kind: "product-change",
    title: "Add a first-run banner",
    reason: "New users land with no orientation.",
    diffStat: "1 file · +2 −1",
    diff: [
      "diff --git a/src/App.tsx b/src/App.tsx",
      "--- a/src/App.tsx",
      "+++ b/src/App.tsx",
      "@@ -1,2 +1,2 @@",
      " import React from 'react'",
      "-const banner = null",
      "+const banner = <FirstRunBanner />",
    ].join("\n"),
  },
};

describe("DecisionGate", () => {
  it("renders the produced diff before the approve/reject actions", async () => {
    const { container } = render(<DecisionGate ventureId="v1" item={productChange} onDecided={() => {}} />);
    // The real artifact renders (the changed file path + the added line from the diff).
    const pathNodes = screen.getAllByText(/src\/App\.tsx/);
    expect(pathNodes.length).toBeGreaterThan(0);
    await waitFor(() => expect(diffBodyText()).toContain("FirstRunBanner"));
    // The exact decision is explicit and binary.
    const approve = screen.getByRole("button", { name: /Approve & send/ });
    const reject = screen.getByRole("button", { name: /Reject/ });
    expect(approve).toBeTruthy();
    expect(reject).toBeTruthy();
    // Artifact-first: the diff appears earlier in the DOM than the approve control.
    expect(pathNodes[0].compareDocumentPosition(approve) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container.querySelector(".now-gate")).toBeTruthy();
  });

  it("requires two explicit acts for a deploy", () => {
    const deploy: WallQueueItemView = {
      ...productChange, id: "wall-2",
      effect: { kind: "deploy", title: "Ship to production", body: "Deploy build 42 to the live site.", deployContract: { command: "npm run deploy", definition: "vercel --prod", destination: "production" } },
    };
    render(<DecisionGate ventureId="v1" item={deploy} onDecided={() => {}} />);
    // First act is to arm the deploy, not to send it.
    expect(screen.getByRole("button", { name: /Authorize deploy/ })).toBeTruthy();
    expect(screen.getByText(/Repository script: vercel --prod/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Deploy$/ })).toBeNull();
  });

  it("makes an unverified deploy visibly unavailable", () => {
    const deploy: WallQueueItemView = {
      ...productChange, id: "wall-unavailable-deploy",
      effect: { kind: "deploy", title: "Ship to production", deployUnavailableReason: "Name an existing package.json deploy script before authorizing this deploy." },
    };
    render(<DecisionGate ventureId="v1" item={deploy} onDecided={() => {}} />);
    expect(screen.getByText(/Name an existing package.json deploy script/)).toBeTruthy();
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Deploy unavailable" }).disabled).toBe(true);
  });

  it("shows one selected file diff instead of repeating every file", async () => {
    const twoFiles: WallQueueItemView = {
      ...productChange,
      effect: {
        ...productChange.effect,
        diff: [
          "diff --git a/src/App.tsx b/src/App.tsx",
          "--- a/src/App.tsx",
          "+++ b/src/App.tsx",
          "@@ -1 +1 @@",
          "-const app = 'old'",
          "+const app = 'new'",
          "diff --git a/src/New.tsx b/src/New.tsx",
          "--- /dev/null",
          "+++ b/src/New.tsx",
          "@@ -0,0 +1 @@",
          "+export const New = true",
        ].join("\n"),
      },
    };
    render(<DecisionGate ventureId="v1" item={twoFiles} onDecided={() => {}} />);
    await waitFor(() => expect(diffBodyText()).toContain("const app = 'new'"));
    expect(diffBodyText()).not.toContain("export const New");
    fireEvent.click(screen.getByRole("button", { name: /src\/New\.tsx/ }));
    await waitFor(() => expect(diffBodyText()).toContain("export const New"));
    expect(diffBodyText()).not.toContain("const app = 'new'");
  });

  it("holds every decision visibly while the venture is read-only", () => {
    render(
      <DecisionGate
        ventureId="v1"
        item={productChange}
        onDecided={() => {}}
        readOnlyReason="Croki is reconnecting. Nothing consequential can change until the firm is current again."
      />,
    );

    expect(screen.getByRole<HTMLButtonElement>("button", { name: /Approve & send/ }).disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>("button", { name: /Reject/ }).disabled).toBe(true);
    expect(screen.getByText(/Nothing consequential can change/)).toBeTruthy();
  });

  it("keeps the exact founder question visible instead of hiding it as machinery", () => {
    const question = "The current direction lost the exact object at the source. Which staged feature should this thread continue with, and what outcome should it preserve?";
    const answer: WallQueueItemView = {
      ...productChange,
      id: "wall-answer",
      purpose: "answer",
      effect: { kind: "question", question },
    };
    render(<DecisionGate ventureId="v1" item={answer} onDecided={() => {}} />);
    expect(screen.getByText(question)).toBeVisible();
    expect(screen.getByText("How should this work continue?")).toBeVisible();
    expect(screen.queryByText("The exact question Croki asked")).not.toBeInTheDocument();
  });

  it("preserves Claude's structured choices, multi-select, and previews", () => {
    const answer: WallQueueItemView = {
      ...productChange,
      id: "wall-provider-question",
      purpose: "answer",
      effect: {
        kind: "provider-question",
        question: "Approach: Which path?",
        questions: [{
          id: "approach",
          header: "Approach",
          question: "Which path should Claude use?",
          multiSelect: true,
          options: [
            { label: "Owned preview", description: "Drive the preview in this Work thread.", preview: "preview_open({ port: 5173 })" },
            { label: "Read only", description: "Inspect without interaction." },
          ],
        }],
      },
    };
    render(<DecisionGate ventureId="v1" item={answer} onDecided={() => {}} />);
    expect(screen.getByText("Which path should Claude use?")).toBeVisible();
    expect(screen.getByText("Drive the preview in this Work thread.")).toBeVisible();
    const choice = screen.getByRole("button", { name: /Owned preview/ });
    expect(choice).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(choice);
    expect(choice).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("preview_open({ port: 5173 })")).toBeVisible();
    expect(screen.getByRole("button", { name: "Send answer" })).toBeEnabled();
  });

  it("shows native permission prompts as exact allow-once decisions", () => {
    const permission: WallQueueItemView = {
      ...productChange,
      id: "wall-provider-permission",
      purpose: "answer",
      effect: {
        kind: "provider-permission",
        title: "Claude wants to run the UI tests",
        exactAction: "npm --prefix ui run test:unit",
        options: ["Allow once", "Deny"],
      },
    };
    render(<DecisionGate ventureId="v1" item={permission} onDecided={() => {}} />);
    expect(screen.getByText("Claude wants to run the UI tests")).toBeVisible();
    expect(screen.getByText("npm --prefix ui run test:unit")).toBeVisible();
    expect(screen.getByRole("button", { name: "Allow once" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Deny" })).toBeVisible();
    expect(screen.getByText(/permits only the named provider tool request/i)).toBeVisible();
    expect(screen.getByText(/never approves an outward action/i)).toBeVisible();
  });

  it("shows a persisted failed send with retry and a working reconnect affordance", () => {
    const reconnect = vi.fn();
    const failed: WallQueueItemView = {
      ...productChange,
      id: "wall-failed-send",
      effect: { kind: "message", to: "founder@example.com", subject: "Proof", body: "Exact release copy" },
      lastExecutionError: "Gmail API 401: invalid credentials",
      needsReconnect: true,
      lastAttemptAt: "2026-07-15T10:01:00Z",
    };
    render(<DecisionGate ventureId="v1" item={failed} onDecided={() => {}} onReconnect={reconnect} />);
    expect(screen.getByText("Nothing was sent.")).toBeInTheDocument();
    expect(screen.getByText(/invalid credentials/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry send" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reconnect Gmail" }));
    expect(reconnect).toHaveBeenCalledOnce();
  });
});
