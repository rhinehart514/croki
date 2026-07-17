import { describe, expect, it } from "vitest";
import { parseUnifiedDiff, diffStat } from "./parseDiff";

const SINGLE = `diff --git a/src/hello.ts b/src/hello.ts
index e69de29..4b825dc 100644
--- a/src/hello.ts
+++ b/src/hello.ts
@@ -1,3 +1,4 @@
 export function hello() {
-  return "hi";
+  return "hello";
+  // extra
 }
`;

describe("parseUnifiedDiff", () => {
  it("parses a single-file diff with correct counts and line numbers", () => {
    const files = parseUnifiedDiff(SINGLE);
    expect(files).toHaveLength(1);
    const file = files[0];
    expect(file.path).toBe("src/hello.ts");
    expect(file.additions).toBe(2);
    expect(file.deletions).toBe(1);
    expect(file.hunks).toHaveLength(1);

    const lines = file.hunks[0].lines;
    // First context line is old 1 / new 1.
    expect(lines[0]).toMatchObject({ kind: "context", oldLine: 1, newLine: 1 });
    // Deletion carries only an old line number.
    const del = lines.find((l) => l.kind === "del");
    expect(del).toMatchObject({ oldLine: 2, text: `  return "hi";` });
    expect(del?.newLine).toBeUndefined();
    // Additions carry only new line numbers, sequential.
    const adds = lines.filter((l) => l.kind === "add");
    expect(adds.map((a) => a.newLine)).toEqual([2, 3]);
  });

  it("parses a multi-file diff", () => {
    const diff = `${SINGLE}diff --git a/b.txt b/b.txt
--- a/b.txt
+++ b/b.txt
@@ -0,0 +1,2 @@
+one
+two
`;
    const files = parseUnifiedDiff(diff);
    expect(files.map((f) => f.path)).toEqual(["src/hello.ts", "b.txt"]);
    expect(files[1].additions).toBe(2);
    expect(files[1].deletions).toBe(0);
  });

  it("computes per-line numbers from @@ -a,b +c,d @@ headers", () => {
    const diff = `diff --git a/f b/f
--- a/f
+++ b/f
@@ -10,3 +20,4 @@
 ctx
+added
 ctx2
 ctx3
`;
    const [file] = parseUnifiedDiff(diff);
    const lines = file.hunks[0].lines;
    expect(lines[0]).toMatchObject({ oldLine: 10, newLine: 20 });
    expect(lines[1]).toMatchObject({ kind: "add", newLine: 21 });
    // Context after the add advances both counters past the insertion.
    expect(lines[2]).toMatchObject({ kind: "context", oldLine: 11, newLine: 22 });
  });

  it("marks a new file (from /dev/null)", () => {
    const diff = `diff --git a/new.ts b/new.ts
new file mode 100644
--- /dev/null
+++ b/new.ts
@@ -0,0 +1,1 @@
+created
`;
    const [file] = parseUnifiedDiff(diff);
    expect(file.path).toBe("new.ts");
    expect(file.oldPath).toBeUndefined();
    expect(file.additions).toBe(1);
  });

  it("marks a deleted file", () => {
    const diff = `diff --git a/gone.ts b/gone.ts
deleted file mode 100644
--- a/gone.ts
+++ /dev/null
@@ -1,1 +0,0 @@
-removed
`;
    const [file] = parseUnifiedDiff(diff);
    expect(file.path).toBe("gone.ts");
    expect(file.deletions).toBe(1);
  });

  it("captures a rename", () => {
    const diff = `diff --git a/old/name.ts b/new/name.ts
similarity index 90%
rename from old/name.ts
rename to new/name.ts
--- a/old/name.ts
+++ b/new/name.ts
@@ -1,1 +1,1 @@
-a
+b
`;
    const [file] = parseUnifiedDiff(diff);
    expect(file.oldPath).toBe("old/name.ts");
    expect(file.path).toBe("new/name.ts");
  });

  it("flags a binary file", () => {
    const diff = `diff --git a/logo.png b/logo.png
index 0000..1111 100644
Binary files a/logo.png and b/logo.png differ
`;
    const [file] = parseUnifiedDiff(diff);
    expect(file.binary).toBe(true);
    expect(file.hunks).toHaveLength(0);
  });

  it("parses a bare unified diff without a diff --git header", () => {
    const diff = `--- a/x.ts
+++ b/x.ts
@@ -1,1 +1,1 @@
-old
+new
`;
    const [file] = parseUnifiedDiff(diff);
    expect(file.path).toBe("x.ts");
    expect(file.additions).toBe(1);
    expect(file.deletions).toBe(1);
  });

  it("returns [] for empty, whitespace, and non-diff input", () => {
    expect(parseUnifiedDiff("")).toEqual([]);
    expect(parseUnifiedDiff("   \n  ")).toEqual([]);
    expect(parseUnifiedDiff("this is just prose\nwith no diff markers")).toEqual([]);
    // @ts-expect-error — defends against a non-string payload.
    expect(parseUnifiedDiff(undefined)).toEqual([]);
  });

  it("handles the no-newline-at-eof marker as meta", () => {
    const diff = `--- a/x
+++ b/x
@@ -1,1 +1,1 @@
-a
\\ No newline at end of file
+b
`;
    const [file] = parseUnifiedDiff(diff);
    const meta = file.hunks[0].lines.find((l) => l.kind === "meta");
    expect(meta?.text).toContain("No newline");
    // The meta row must not shift line numbering.
    expect(file.additions).toBe(1);
    expect(file.deletions).toBe(1);
  });
});

describe("diffStat", () => {
  it("aggregates files, additions, and deletions", () => {
    const files = parseUnifiedDiff(`${SINGLE}--- a/b.txt
+++ b/b.txt
@@ -0,0 +1,3 @@
+a
+b
+c
`);
    expect(diffStat(files)).toEqual({ files: 2, additions: 5, deletions: 1 });
  });

  it("returns zeroes for an empty file list", () => {
    expect(diffStat([])).toEqual({ files: 0, additions: 0, deletions: 0 });
  });
});
