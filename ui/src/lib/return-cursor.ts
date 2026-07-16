const PREFIX = "drover:return-cursor:v1:";

function key(ventureId: string) {
  return `${PREFIX}${ventureId}`;
}

export function readReturnCursor(ventureId: string): string | null {
  try {
    const value = localStorage.getItem(key(ventureId));
    return value && Number.isFinite(Date.parse(value)) ? value : null;
  } catch {
    return null;
  }
}

export function advanceReturnCursor(ventureId: string, reviewedThrough: string) {
  if (!ventureId || !Number.isFinite(Date.parse(reviewedThrough))) return;
  try {
    const current = readReturnCursor(ventureId);
    if (!current || Date.parse(reviewedThrough) > Date.parse(current)) {
      localStorage.setItem(key(ventureId), reviewedThrough);
    }
  } catch {
    // Losing the presentation cursor replays history; it never hides or resolves firm records.
  }
}
