export type TerminalDescriptor = { id: string; name: string };
export type TerminalLayout = { terminals: TerminalDescriptor[]; activeId: string; splitId: string | null };

const PREFIX = "drover:terminal-layout:v1:";
const fallback = (): TerminalLayout => ({
  terminals: [{ id: "main", name: "Terminal" }],
  activeId: "main",
  splitId: null,
});

function safeName(value: unknown, index: number) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 48) : `Terminal ${index + 1}`;
}

export function normalizeTerminalLayout(value: unknown): TerminalLayout {
  if (!value || typeof value !== "object") return fallback();
  const input = value as Partial<TerminalLayout>;
  const terminals = Array.isArray(input.terminals)
    ? input.terminals.flatMap((entry, index) => (
      entry && typeof entry.id === "string" && /^[\w.:-]{1,96}$/.test(entry.id)
        ? [{ id: entry.id, name: safeName(entry.name, index) }]
        : []
    )).slice(0, 8)
    : [];
  if (!terminals.length) return fallback();
  const activeId = terminals.some((entry) => entry.id === input.activeId) ? input.activeId as string : terminals[0].id;
  const splitId = terminals.some((entry) => entry.id === input.splitId && entry.id !== activeId) ? input.splitId as string : null;
  return { terminals, activeId, splitId };
}

export function readTerminalLayout(ventureId: string, workspaceId: string): TerminalLayout {
  try {
    return normalizeTerminalLayout(JSON.parse(localStorage.getItem(`${PREFIX}${ventureId}:${workspaceId}`) ?? "null"));
  } catch {
    return fallback();
  }
}

export function rememberTerminalLayout(ventureId: string, workspaceId: string, layout: TerminalLayout) {
  try {
    localStorage.setItem(`${PREFIX}${ventureId}:${workspaceId}`, JSON.stringify(normalizeTerminalLayout(layout)));
  } catch { /* local presentation memory only */ }
}

export function nextTerminal(layout: TerminalLayout, id: string): TerminalLayout {
  const terminals = [...layout.terminals, { id, name: `Terminal ${layout.terminals.length + 1}` }].slice(0, 8);
  return { terminals, activeId: id, splitId: layout.splitId };
}

export function removeTerminal(layout: TerminalLayout, id: string): TerminalLayout {
  const terminals = layout.terminals.filter((entry) => entry.id !== id);
  if (!terminals.length) return fallback();
  const activeId = layout.activeId === id ? terminals[0].id : layout.activeId;
  const splitId = layout.splitId === id || activeId === layout.splitId ? null : layout.splitId;
  return { terminals, activeId, splitId };
}
