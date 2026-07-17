import { describe, expect, it } from "vitest";
import { buildFileTree } from "./buildFileTree";

describe("buildFileTree", () => {
  it("nests folders and files from flat paths", () => {
    const tree = buildFileTree(["src/a.ts", "src/lib/b.ts", "README.md"]);
    // Folders sort before files: src/ then README.md.
    expect(tree.map((n) => n.name)).toEqual(["src", "README.md"]);
    const src = tree[0];
    expect(src.type).toBe("folder");
    // Inside src: lib/ folder before a.ts file.
    expect(src.children.map((n) => `${n.type}:${n.name}`)).toEqual(["folder:lib", "file:a.ts"]);
    expect(src.children[0].children[0]).toMatchObject({ name: "b.ts", path: "src/lib/b.ts", type: "file" });
  });

  it("collapses duplicate paths and shared folders", () => {
    const tree = buildFileTree(["x/y/a.ts", "x/y/b.ts", "x/y/a.ts"]);
    expect(tree).toHaveLength(1);
    const y = tree[0].children[0];
    expect(y.children.map((n) => n.name)).toEqual(["a.ts", "b.ts"]);
  });

  it("ignores blank segments and empty input", () => {
    expect(buildFileTree([])).toEqual([]);
    expect(buildFileTree(["", "  "])).toEqual([]);
    const tree = buildFileTree(["/leading/slash.ts"]);
    expect(tree[0].name).toBe("leading");
  });

  it("carries the full path on every node", () => {
    const [root] = buildFileTree(["a/b/c.ts"]);
    expect(root.path).toBe("a");
    expect(root.children[0].path).toBe("a/b");
    expect(root.children[0].children[0].path).toBe("a/b/c.ts");
  });
});
