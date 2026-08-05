import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import { PreviewDecisionBar } from "./PreviewDecisionBar";

const actions = {
  onKeep: vi.fn(),
  onCombine: vi.fn(),
  onDiscard: vi.fn(),
  onStop: vi.fn(),
};

describe("PreviewDecisionBar", () => {
  it("shows truthful working state before alternatives are ready", () => {
    const html = renderToStaticMarkup(<PreviewDecisionBar state="options-working" {...actions} />);
    expect(html).toContain("Creating live alternatives");
    expect(html).toContain("Stop");
    expect(html).not.toContain(">Keep<");
  });

  it("offers direct decisions for the active live option", () => {
    const html = renderToStaticMarkup(<PreviewDecisionBar state="options-ready" {...actions} />);
    expect(html).toContain("Discard");
    expect(html).toContain("Combine");
    expect(html).toContain("Keep");
  });

  it("distinguishes applying a decision from building or generating", () => {
    const html = renderToStaticMarkup(<PreviewDecisionBar state="applying" {...actions} />);
    expect(html).toContain("Applying the Preview decision");
  });
});
