import { describe, expect, it } from "vite-plus/test";

import { resolveChatMarkdownImageSource } from "./chatMarkdownImages";

describe("resolveChatMarkdownImageSource", () => {
  it("keeps remote http images remote", () => {
    expect(resolveChatMarkdownImageSource("https://example.com/result.png", "/work/app")).toEqual({
      _tag: "remote",
      url: "https://example.com/result.png",
    });
  });

  it("resolves relative and absolute workspace images", () => {
    expect(resolveChatMarkdownImageSource("art/result.png", "/work/app")).toEqual({
      _tag: "workspace",
      path: "/work/app/art/result.png",
    });
    expect(resolveChatMarkdownImageSource("/work/app/result.webp", "/work/app")).toEqual({
      _tag: "workspace",
      path: "/work/app/result.webp",
    });
  });

  it("refuses executable and embedded image schemes", () => {
    expect(resolveChatMarkdownImageSource("javascript:alert(1)", "/work/app")._tag).toBe(
      "unsupported",
    );
    expect(resolveChatMarkdownImageSource("data:image/png;base64,AAAA", "/work/app")._tag).toBe(
      "unsupported",
    );
  });
});
