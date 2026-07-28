export const TERMINAL_REFERENCE_EVENT = "drover:terminal-reference";
export const OPEN_TERMINAL_REFERENCE_EVENT = "drover:open-terminal-reference";
const MARKER = /\[([^\]]{1,48}) · terminal output\]\(terminal-ref:([A-Za-z0-9_-]+)\)/;
const QUEUE_KEY = "drover:terminal-reference:reopen";

export type TerminalReference = {
  ref: string;
  ventureId: string;
  workspaceId: string;
  threadRef: string;
  terminalId: string;
  terminalName: string;
  text: string;
  start: { x: number; y: number };
  end: { x: number; y: number };
};

function encode(value: TerminalReference) {
  const compact = {
    r: value.ref, v: value.ventureId, w: value.workspaceId, h: value.threadRef,
    i: value.terminalId, n: value.terminalName,
    s: [value.start.x, value.start.y], e: [value.end.x, value.end.y],
  };
  const bytes = new TextEncoder().encode(JSON.stringify(compact));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decode(value: string, text: string): TerminalReference | null {
  try {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as {
      r?: string; v?: string; w?: string; h?: string; i?: string; n?: string; s?: number[]; e?: number[];
    };
    if (!parsed.r?.startsWith("terminal:") || !parsed.v || !parsed.w || !parsed.h || !parsed.i || !parsed.n || !text) return null;
    return {
      ref: parsed.r, ventureId: parsed.v, workspaceId: parsed.w, threadRef: parsed.h,
      terminalId: parsed.i, terminalName: parsed.n, text,
      start: { x: Number(parsed.s?.[0]) || 0, y: Number(parsed.s?.[1]) || 0 },
      end: { x: Number(parsed.e?.[0]) || 0, y: Number(parsed.e?.[1]) || 0 },
    };
  } catch {
    return null;
  }
}

export function formatTerminalReference(reference: TerminalReference) {
  return `Terminal ${reference.terminalName} · ${reference.ref}\n\`\`\`text\n${reference.text.slice(0, 8_000)}\n\`\`\`\n[${reference.terminalName} · terminal output](terminal-ref:${encode(reference)})\n`;
}

export function terminalReferenceIn(content: string) {
  const match = content.match(MARKER);
  const selected = content.match(/```text\n([\s\S]*?)\n```/)?.[1] ?? "";
  return match ? { reference: decode(match[2], selected), content: content.replace(match[0], "").trimStart() } : { reference: null, content };
}

export function publishTerminalReference(reference: TerminalReference) {
  window.dispatchEvent(new CustomEvent<TerminalReference>(TERMINAL_REFERENCE_EVENT, { detail: reference }));
}

export function openTerminalReference(reference: TerminalReference) {
  try { sessionStorage.setItem(QUEUE_KEY, JSON.stringify(reference)); } catch { /* event remains sufficient */ }
  window.dispatchEvent(new CustomEvent<TerminalReference>(OPEN_TERMINAL_REFERENCE_EVENT, { detail: reference }));
}

export function takeQueuedTerminalReference(workspaceId: string) {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(QUEUE_KEY) ?? "null") as TerminalReference | null;
    if (!parsed || parsed.workspaceId !== workspaceId) return null;
    sessionStorage.removeItem(QUEUE_KEY);
    return parsed;
  } catch {
    return null;
  }
}
