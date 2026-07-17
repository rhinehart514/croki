// Pure unified-diff parsing. No React, no DOM — the diff string that arrives on a product-change
// effect is standard git output, and turning it into structured files/hunks/lines is a
// deterministic transform, so it lives as tested helpers the view layer can render without logic.

export type DiffLineKind = "add" | "del" | "context" | "meta";

export interface DiffLine {
  kind: DiffLineKind;
  /** 1-based line number in the old file; absent for pure additions and meta rows. */
  oldLine?: number;
  /** 1-based line number in the new file; absent for pure deletions and meta rows. */
  newLine?: number;
  /** Content of the line without its leading +/-/space marker. */
  text: string;
}

export interface DiffHunk {
  /** The raw `@@ -a,b +c,d @@` header, section heading included. */
  header: string;
  lines: DiffLine[];
}

export interface DiffFile {
  path: string;
  /** Original path when the file was renamed or copied. */
  oldPath?: string;
  hunks: DiffHunk[];
  additions: number;
  deletions: number;
  binary?: boolean;
}

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@(.*)$/;

// Strip a leading `a/` or `b/` prefix that git prepends to tracked paths, but leave real paths and
// /dev/null intact so deletions and additions still read correctly.
function stripPrefix(raw: string): string {
  const path = raw.trim().replace(/^"|"$/g, "");
  if (path === "/dev/null") return path;
  return path.replace(/^[ab]\//, "");
}

function newFile(path: string): DiffFile {
  return { path, hunks: [], additions: 0, deletions: 0 };
}

/**
 * Parse a standard unified diff into structured files. Returns [] for empty, malformed, or
 * non-diff input rather than throwing — the caller renders a quiet empty state instead of crashing.
 */
export function parseUnifiedDiff(diff: string): DiffFile[] {
  if (typeof diff !== "string" || diff.trim() === "") return [];

  const lines = diff.split(/\r?\n/);
  const files: DiffFile[] = [];
  let file: DiffFile | null = null;
  let hunk: DiffHunk | null = null;
  let oldNo = 0;
  let newNo = 0;

  const commitFile = () => {
    if (file && (file.hunks.length > 0 || file.binary || file.path !== "")) files.push(file);
    file = null;
    hunk = null;
  };

  for (const line of lines) {
    if (line.startsWith("diff --git")) {
      commitFile();
      // `diff --git a/path b/path` — take the b-side as the canonical path; header lines refine it.
      const match = /^diff --git\s+(\S+)\s+(\S+)/.exec(line);
      file = newFile(match ? stripPrefix(match[2]) : "");
      continue;
    }

    // A `--- ` marker begins a new file whenever we aren't already mid-header for a fresh one —
    // either no file is open, or the open file already accumulated hunks (a concatenated bare diff).
    if (line.startsWith("--- ") && (file === null || file.hunks.length > 0)) {
      commitFile();
      file = newFile("");
    }

    if (file === null) {
      // A bare unified diff (no `diff --git`) still starts at `+++`. Open a file for it.
      if (line.startsWith("+++ ")) file = newFile("");
      else continue;
    }

    if (line.startsWith("rename from ") || line.startsWith("copy from ")) {
      file.oldPath = stripPrefix(line.replace(/^(rename|copy) from /, ""));
      continue;
    }
    if (line.startsWith("rename to ") || line.startsWith("copy to ")) {
      file.path = stripPrefix(line.replace(/^(rename|copy) to /, ""));
      continue;
    }
    if (line.startsWith("Binary files ") || line.startsWith("GIT binary patch")) {
      file.binary = true;
      continue;
    }
    if (line.startsWith("--- ")) {
      const p = stripPrefix(line.slice(4));
      if (p !== "/dev/null") file.oldPath = p;
      continue;
    }
    if (line.startsWith("+++ ")) {
      const p = stripPrefix(line.slice(4));
      if (p !== "/dev/null" && file.path === "") file.path = p;
      continue;
    }

    const hunkMatch = HUNK_HEADER.exec(line);
    if (hunkMatch) {
      oldNo = Number(hunkMatch[1]);
      newNo = Number(hunkMatch[3]);
      hunk = { header: line, lines: [] };
      file.hunks.push(hunk);
      continue;
    }

    if (hunk === null) continue; // index/mode/similarity lines between header and first hunk.

    const marker = line[0];
    if (marker === "+") {
      hunk.lines.push({ kind: "add", newLine: newNo, text: line.slice(1) });
      newNo += 1;
      file.additions += 1;
    } else if (marker === "-") {
      hunk.lines.push({ kind: "del", oldLine: oldNo, text: line.slice(1) });
      oldNo += 1;
      file.deletions += 1;
    } else if (marker === "\\") {
      // "\ No newline at end of file" — metadata, not a content line.
      hunk.lines.push({ kind: "meta", text: line.slice(1).trim() });
    } else {
      // A leading space is context; a truly empty line inside a hunk is empty context.
      hunk.lines.push({ kind: "context", oldLine: oldNo, newLine: newNo, text: line.slice(1) });
      oldNo += 1;
      newNo += 1;
    }
  }

  commitFile();
  // Guard against non-diff prose that happened to contain no diff markers.
  return files.filter((f) => f.hunks.length > 0 || f.binary || f.oldPath !== undefined);
}

export interface DiffStat {
  files: number;
  additions: number;
  deletions: number;
}

export function diffStat(files: DiffFile[]): DiffStat {
  return files.reduce<DiffStat>(
    (acc, f) => ({
      files: acc.files + 1,
      additions: acc.additions + f.additions,
      deletions: acc.deletions + f.deletions,
    }),
    { files: 0, additions: 0, deletions: 0 },
  );
}
