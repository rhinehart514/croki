import { describe, expect, it } from "vitest";
import { repositoryCitationFromHref } from "./repositoryCitation";

describe("repository citation links", () => {
  it("resolves historic absolute paths only within the active venture repository", () => {
    expect(repositoryCitationFromHref(
      "/Users/jacob/Projects/drover/docs/STATE.md:37",
      "/Users/jacob/Projects/drover",
    )).toEqual({ path: "docs/STATE.md", startLine: 37, endLine: 37 });
    expect(repositoryCitationFromHref(
      "file:///Users/jacob/Projects/drover/ui/src/App.tsx#L8-L12",
      "/Users/jacob/Projects/drover/",
    )).toEqual({ path: "ui/src/App.tsx", startLine: 8, endLine: 12 });
    expect(repositoryCitationFromHref(
      "docs/STATE.md:9",
      "/Users/jacob/Projects/drover",
    )).toEqual({ path: "docs/STATE.md", startLine: 9, endLine: 9 });
    expect(repositoryCitationFromHref(
      "/Users/jacob/Projects/other/.env:1",
      "/Users/jacob/Projects/drover",
    )).toBeNull();
    expect(repositoryCitationFromHref(
      "file://attacker/Users/jacob/Projects/drover/docs/STATE.md:1",
      "/Users/jacob/Projects/drover",
    )).toBeNull();
  });

  it("resolves structurally complete durable refs and rejects traversal or bare refs", () => {
    expect(repositoryCitationFromHref(
      "repository:src/app.tsx#L4-L9:abc123def456",
    )).toEqual({ path: "src/app.tsx", startLine: 4, endLine: 9, digest: "abc123def456" });
    expect(repositoryCitationFromHref("repository:../.env#L1-L1:abc123")).toBeNull();
    expect(repositoryCitationFromHref("repository:src/app.tsx")).toBeNull();
    expect(repositoryCitationFromHref("src/%2e%2e/.env:1", "/repo")).toBeNull();
    expect(repositoryCitationFromHref("src/app.tsx?line=1", "/repo")).toBeNull();
    expect(repositoryCitationFromHref("https://example.com/src/app.tsx:1", "/repo")).toBeNull();
  });
});
