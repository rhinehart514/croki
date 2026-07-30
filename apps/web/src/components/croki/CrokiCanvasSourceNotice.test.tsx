import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const buttonProps = vi.hoisted(
  () =>
    [] as Array<{
      readonly children?: unknown;
      readonly onClick?: () => void;
    }>,
);

vi.mock("../ui/button", () => ({
  Button: (props: {
    readonly children?: unknown;
    readonly className?: string;
    readonly onClick?: () => void;
  }) => {
    buttonProps.push(props);
    return <button className={props.className}>{props.children as never}</button>;
  },
}));

import { createEmptyCrokiContext } from "@t3tools/shared/crokiContext";
import { CrokiCanvasSourceNotice } from "./CrokiCanvasSourceNotice";
import type { CrokiCanvasDraftSnapshot } from "./crokiCanvasDraftStore";

describe("CrokiCanvasSourceNotice", () => {
  beforeEach(() => {
    buttonProps.length = 0;
  });

  it.each(["loading", "valid"] as const)("does not add noise for the %s state", (sourceState) => {
    expect(
      renderToStaticMarkup(
        <CrokiCanvasSourceNotice {...callbacks()} state={snapshot({ sourceState })} />,
      ),
    ).toBe("");
  });

  it("labels a missing Canvas and explains how it will be created", () => {
    const markup = renderToStaticMarkup(
      <CrokiCanvasSourceNotice {...callbacks()} state={snapshot({ sourceState: "missing" })} />,
    );

    expect(markup).toContain('role="status"');
    expect(markup).toContain("No Canvas file yet");
    expect(markup).toContain(".croki/context.json");
  });

  it("requires two explicit actions before malformed repair", () => {
    const onRequestRepair = vi.fn();
    const onConfirmRepair = vi.fn();
    renderToStaticMarkup(
      <CrokiCanvasSourceNotice
        {...callbacks()}
        onConfirmRepair={onConfirmRepair}
        onRequestRepair={onRequestRepair}
        state={snapshot({
          sourceMessage: "Croki context is not valid JSON.",
          sourceState: "malformed",
        })}
      />,
    );
    findButton("Repair Canvas").onClick?.();
    expect(onRequestRepair).toHaveBeenCalledOnce();
    expect(onConfirmRepair).not.toHaveBeenCalled();

    buttonProps.length = 0;
    const markup = renderToStaticMarkup(
      <CrokiCanvasSourceNotice
        {...callbacks()}
        onConfirmRepair={onConfirmRepair}
        state={snapshot({
          repairConfirmation: true,
          sourceMessage: "Croki context is not valid JSON.",
          sourceState: "malformed",
        })}
      />,
    );
    expect(markup).toContain('role="alert"');
    expect(markup).toContain("Replace the invalid file");
    findButton("Repair").onClick?.();
    expect(onConfirmRepair).toHaveBeenCalledOnce();
  });

  it("offers to preserve recovered items when only some entries are invalid", () => {
    const onConfirmRepair = vi.fn();
    const markup = renderToStaticMarkup(
      <CrokiCanvasSourceNotice
        {...callbacks()}
        onConfirmRepair={onConfirmRepair}
        state={snapshot({
          repairConfirmation: true,
          sourceMessage: "1 invalid Canvas entry was omitted. Valid items are preserved.",
          sourceState: "partial",
        })}
      />,
    );

    expect(markup).toContain("Canvas partially recovered");
    expect(markup).toContain("preserve the recovered items");
    findButton("Use recovered copy").onClick?.();
    expect(onConfirmRepair).toHaveBeenCalledOnce();
  });

  it("keeps read errors retryable and protects dirty drafts", () => {
    const onRetry = vi.fn();
    const cleanMarkup = renderToStaticMarkup(
      <CrokiCanvasSourceNotice
        {...callbacks()}
        onRetry={onRetry}
        state={snapshot({
          sourceMessage: "Workspace disconnected.",
          sourceState: "read-error",
        })}
      />,
    );
    expect(cleanMarkup).toContain("Create if missing");
    findButton("Retry").onClick?.();
    expect(onRetry).toHaveBeenCalledOnce();

    buttonProps.length = 0;
    const dirtyMarkup = renderToStaticMarkup(
      <CrokiCanvasSourceNotice
        {...callbacks()}
        state={snapshot({
          dirty: true,
          sourceMessage: "Workspace disconnected.",
          sourceState: "read-error",
        })}
      />,
    );
    expect(dirtyMarkup).not.toContain("Create if missing");
    expect(dirtyMarkup).toContain("Workspace disconnected.");
  });

  it("offers an explicit reload when an external edit conflicts", () => {
    const onReloadConflict = vi.fn();
    const markup = renderToStaticMarkup(
      <CrokiCanvasSourceNotice
        {...callbacks()}
        onReloadConflict={onReloadConflict}
        state={snapshot({ conflictContents: '{"version":1}' })}
      />,
    );

    expect(markup).toContain("Your draft is preserved");
    findButton("Reload workspace copy").onClick?.();
    expect(onReloadConflict).toHaveBeenCalledOnce();
  });
});

function snapshot(patch: Partial<CrokiCanvasDraftSnapshot>): CrokiCanvasDraftSnapshot {
  const context = createEmptyCrokiContext("Croki");
  return {
    context,
    baseline: context,
    baselineContents: null,
    conflictContents: null,
    dirty: false,
    isSaving: false,
    modelError: null,
    repairConfirmation: false,
    repairInProgress: false,
    selectedNodeId: null,
    sourceMessage: null,
    sourceState: "valid",
    ...patch,
  };
}

function callbacks() {
  return {
    onCancelRepair: vi.fn(),
    onConfirmRepair: vi.fn(),
    onReloadConflict: vi.fn(),
    onRequestRepair: vi.fn(),
    onRetry: vi.fn(),
  };
}

function findButton(label: string) {
  const props = buttonProps.find((candidate) => buttonText(candidate.children) === label);
  if (!props) throw new Error(`Could not find button '${label}'.`);
  return props;
}

function buttonText(value: unknown): string {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  return value.map(buttonText).join("");
}
