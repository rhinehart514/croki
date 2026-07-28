export type TerminalLink =
  | { kind: "url"; value: string; start: number; end: number; localhost: boolean }
  | { kind: "file"; value: string; path: string; line: number; column: number | null; start: number; end: number };

export const TERMINAL_FILE_LINK_EVENT = "drover:terminal-file-link";

const URL_PATTERN = /\bhttps?:\/\/[^\s<>"')\]]+/gi;
const FILE = /(?:^|[\s("'`])((?:\.{0,2}\/)?[\w@.+-][\w@./+-]*\.[a-zA-Z0-9]{1,12}):(\d+)(?::(\d+))?/g;

export function detectTerminalLinks(text: string): TerminalLink[] {
  const links: TerminalLink[] = [];
  for (const match of text.matchAll(URL_PATTERN)) {
    const value = match[0];
    let localhost = false;
    try { localhost = ["localhost", "127.0.0.1", "::1"].includes(new URL(value).hostname); } catch { /* ignored */ }
    links.push({ kind: "url", value, start: match.index, end: match.index + value.length, localhost });
  }
  for (const match of text.matchAll(FILE)) {
    const value = `${match[1]}:${match[2]}${match[3] ? `:${match[3]}` : ""}`;
    const start = match.index + match[0].indexOf(match[1]);
    links.push({
      kind: "file",
      value,
      path: match[1].replace(/^\.\//, ""),
      line: Number(match[2]),
      column: match[3] ? Number(match[3]) : null,
      start,
      end: start + value.length,
    });
  }
  return links.sort((left, right) => left.start - right.start);
}

export function repositoryPath(link: Extract<TerminalLink, { kind: "file" }>, worktree?: string | null) {
  if (!link.path.startsWith("/")) return link.path.replace(/^\.\//, "");
  const root = worktree?.replace(/\/+$/, "");
  return root && link.path.startsWith(`${root}/`) ? link.path.slice(root.length + 1) : null;
}
