import type { CrokiThoughtView } from "@croki/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import { CrokiThoughtViewBasis } from "./CrokiThoughtViewBasis";
import { CrokiThoughtViewField } from "./CrokiThoughtViewField";
import { CrokiInlineThoughtView } from "./CrokiInlineThoughtView";

const view: CrokiThoughtView = {
  version: 1,
  id: "view-1",
  generatedAt: "2026-08-08T12:00:00.000Z",
  sourceRevision: 7,
  representation: "comparison",
  alternateRepresentation: "causal",
  basis: {
    question: "What are the genuinely different product worlds?",
    foregrounds: ["Different possibilities", "Visible consequences"],
    omits: ["Private model reasoning"],
    coverage: "3 observations across 2 source families",
  },
  statements: [
    {
      id: "statement:native",
      objectId: "native",
      title: "Native ADE",
      body: "Keep the provider native.",
      epistemicState: "observed",
      sourceIds: ["source:native"],
      revision: 7,
      kind: "direction",
    },
    {
      id: "statement:harness",
      objectId: "harness",
      title: "Separate Product behavior",
      body: "A mode changes the provider instruction.",
      epistemicState: "contradicted",
      sourceIds: ["source:harness"],
      revision: 6,
      kind: "conflict",
    },
  ],
  relationships: [],
  regions: [
    {
      id: "region:a",
      kind: "lane",
      title: "One world",
      statementIds: ["statement:native"],
    },
    {
      id: "region:b",
      kind: "lane",
      title: "Another world",
      statementIds: ["statement:harness"],
    },
  ],
  sources: [
    {
      id: "source:native",
      objectId: "native",
      kind: "thread",
      title: "Native ADE",
      observedAt: "2026-08-08T12:00:00.000Z",
      uri: "file:///repo/DESIGN.md",
    },
    {
      id: "source:harness",
      objectId: "harness",
      kind: "code",
      title: "Separate Product behavior",
      observedAt: "2026-08-08T12:00:00.000Z",
    },
  ],
};

describe("CrokiThoughtViewField", () => {
  it("renders materially different worlds with visible epistemic state", () => {
    const markup = renderToStaticMarkup(
      <CrokiThoughtViewField
        view={view}
        selectedObjectIds={[]}
        onClearSelection={vi.fn()}
        onSelect={vi.fn()}
      />,
    );

    expect(markup).toContain("Comparison view");
    expect(markup).toContain("One world");
    expect(markup).toContain("Another world");
    expect(markup).toContain("Observed");
    expect(markup).toContain("Contradicted");
    expect(markup).toContain("Source revision 7");
  });

  it("makes framing and omissions inspectable", () => {
    const markup = renderToStaticMarkup(<CrokiThoughtViewBasis view={view} />);
    expect(markup).toContain("Representing");
    expect(markup).toContain("Foregrounds");
    expect(markup).toContain("Private model reasoning");
  });

  it("renders inside a turn without reintroducing a Canvas destination", () => {
    const markup = renderToStaticMarkup(
      <CrokiInlineThoughtView
        view={view}
        basisOpen
        selectedObjectIds={[]}
        updateAvailable={false}
        onToggleBasis={vi.fn()}
        onReframe={vi.fn()}
        onUpdate={vi.fn()}
        onUse={vi.fn()}
        onOpenSource={vi.fn()}
      />,
    );

    expect(markup).toContain("View · Comparison");
    expect(markup).toContain("Reframe");
    expect(markup).toContain("Select a statement to inspect or use it");
    expect(markup).not.toContain("Open Canvas");
    expect(markup).not.toContain("Croki Live Canvas");
  });
});
