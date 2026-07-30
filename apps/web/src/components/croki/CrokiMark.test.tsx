import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const useReducedMotionMock = vi.hoisted(() => vi.fn<() => boolean | null>(() => false));

vi.mock("motion/react", async () => {
  const actual = await vi.importActual<typeof import("motion/react")>("motion/react");
  return {
    ...actual,
    useReducedMotion: useReducedMotionMock,
  };
});

import { CrokiMark } from "./CrokiMark";

describe("CrokiMark", () => {
  beforeEach(() => {
    useReducedMotionMock.mockReturnValue(false);
  });

  it("renders the accessible animated Croki mark by default", () => {
    const markup = renderToStaticMarkup(<CrokiMark />);

    expect(markup).toContain('aria-label="Croki"');
    expect(markup).toContain('data-croki-mark-motion="animated"');
    expect(markup).toContain("croki-spectrum-");
    expect(markup).toContain("croki-face-");
  });

  it("keeps decorative marks out of the accessibility tree", () => {
    const markup = renderToStaticMarkup(<CrokiMark decorative />);

    expect(markup).toContain('aria-hidden="true"');
    expect(markup).not.toContain('aria-label="Croki"');
  });

  it("stays static when the user prefers reduced motion", () => {
    useReducedMotionMock.mockReturnValue(true);

    const markup = renderToStaticMarkup(<CrokiMark />);

    expect(markup).toContain('data-croki-mark-motion="static"');
  });

  it("supports explicitly static placements such as exported brand surfaces", () => {
    const markup = renderToStaticMarkup(<CrokiMark animated={false} />);

    expect(markup).toContain('data-croki-mark-motion="static"');
  });

  it("uses unique gradient and clip identifiers for every mark", () => {
    const markup = renderToStaticMarkup(
      <>
        <CrokiMark />
        <CrokiMark />
      </>,
    );
    const gradientIds = [...markup.matchAll(/id="(croki-spectrum-[^"]+)"/gu)].map(([, id]) => id);
    const clipIds = [...markup.matchAll(/id="(croki-face-[^"]+)"/gu)].map(([, id]) => id);

    expect(new Set(gradientIds).size).toBe(2);
    expect(new Set(clipIds).size).toBe(2);
  });
});
