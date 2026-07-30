import type { CrokiContextReference } from "@t3tools/shared/crokiContext";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const buttons = vi.hoisted(
  () =>
    [] as Array<{
      readonly "aria-label"?: string;
      readonly children?: unknown;
      readonly onClick?: () => void;
    }>,
);

vi.mock("../ui/button", () => ({
  Button: (props: {
    readonly "aria-label"?: string;
    readonly children?: unknown;
    readonly onClick?: () => void;
  }) => {
    buttons.push(props);
    return <button aria-label={props["aria-label"]}>{props.children as never}</button>;
  },
}));

import { CrokiCanvasReferences } from "./CrokiCanvasReferences";

const REFERENCES: readonly CrokiContextReference[] = [
  { kind: "file", path: "src/canvas.ts", line: 42 },
  { kind: "url", url: "https://example.com/evidence" },
];

describe("CrokiCanvasReferences", () => {
  beforeEach(() => {
    buttons.length = 0;
  });

  it("renders old nodes without references as an editable empty state", () => {
    const markup = renderToStaticMarkup(
      <CrokiCanvasReferences references={[]} onAdd={() => null} onRemove={vi.fn()} />,
    );

    expect(markup).toContain('aria-label="Evidence references"');
    expect(markup).toContain("No portable evidence attached");
    expect(markup).toContain('aria-label="Reference kind"');
    expect(markup).toContain('aria-label="Repository-relative path"');
    expect(markup).toContain('aria-label="Optional line number"');
    expect(markup).toContain('aria-label="Add evidence reference"');
  });

  it("opens and removes portable file and URL references", () => {
    const onOpenReference = vi.fn();
    const onRemove = vi.fn();
    const markup = renderToStaticMarkup(
      <CrokiCanvasReferences
        references={REFERENCES}
        onAdd={() => null}
        onOpenReference={onOpenReference}
        onRemove={onRemove}
      />,
    );

    expect(markup).toContain("src/canvas.ts:42");
    expect(markup).toContain("https://example.com/evidence");
    findButton("Open src/canvas.ts:42").onClick?.();
    findButton("Remove https://example.com/evidence").onClick?.();
    expect(onOpenReference).toHaveBeenCalledWith(REFERENCES[0]);
    expect(onRemove).toHaveBeenCalledWith(REFERENCES[1]);
  });
});

function findButton(label: string) {
  const props = buttons.find((candidate) => candidate["aria-label"] === label);
  if (!props) throw new Error(`Could not find button '${label}'.`);
  return props;
}
