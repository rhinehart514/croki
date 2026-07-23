import { describe, expect, it } from "vitest";
import {
  expandFileMentions,
  fileMentionEndingAt,
  fileMentionSpans,
  fileMentionTokenFor,
  pruneFileMentions,
  type ComposerFileMention,
} from "./composerFileMentions";

const surface: ComposerFileMention = { path: "ui/src/components/work-mode/WorkSurface.tsx", token: "@WorkSurface.tsx" };

describe("fileMentionTokenFor", () => {
  it("uses the shortest tail — the basename — when it is unique", () => {
    expect(fileMentionTokenFor("ui/src/components/work-mode/WorkSurface.tsx", [])).toBe("@WorkSurface.tsx");
  });

  it("widens by one directory when another tracked file already owns the basename", () => {
    const taken: ComposerFileMention[] = [{ path: "ui/src/index.css", token: "@index.css" }];
    expect(fileMentionTokenFor("brain/src/index.css", taken)).toBe("@src/index.css");
  });

  it("returns the existing token for a path that is already tracked", () => {
    expect(fileMentionTokenFor(surface.path, [surface])).toBe("@WorkSurface.tsx");
  });
});

describe("fileMentionSpans", () => {
  it("finds every whitespace-bounded occurrence in draft order", () => {
    const spans = fileMentionSpans("fix @WorkSurface.tsx then test @WorkSurface.tsx", [surface]);
    expect(spans.map((span) => span.start)).toEqual([4, 31]);
  });

  it("ignores a token edited from the inside or glued to other text", () => {
    expect(fileMentionSpans("fix x@WorkSurface.tsx", [surface])).toEqual([]);
    expect(fileMentionSpans("fix @WorkSurface.tsxx", [surface])).toEqual([]);
  });
});

describe("expandFileMentions", () => {
  it("replaces each chip token with its exact repo-relative path", () => {
    expect(expandFileMentions("fix @WorkSurface.tsx now", [surface]))
      .toBe("fix ui/src/components/work-mode/WorkSurface.tsx now");
  });

  it("leaves an untracked or broken token as the founder's literal text", () => {
    expect(expandFileMentions("fix @Other.tsx", [surface])).toBe("fix @Other.tsx");
  });
});

describe("pruneFileMentions", () => {
  it("drops a mention whose token no longer appears in the draft", () => {
    expect(pruneFileMentions("fix it", [surface])).toEqual([]);
  });

  it("returns the same list untouched when every mention still stands", () => {
    const mentions = [surface];
    expect(pruneFileMentions("fix @WorkSurface.tsx", mentions)).toBe(mentions);
  });
});

describe("fileMentionEndingAt", () => {
  it("returns the span whose end sits exactly at the caret — the atomic-delete target", () => {
    const draft = "fix @WorkSurface.tsx now";
    expect(fileMentionEndingAt(draft, 20, [surface])?.path).toBe(surface.path);
    expect(fileMentionEndingAt(draft, 19, [surface])).toBeNull();
  });
});
