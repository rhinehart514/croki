// configuration-diff.mjs — a small, stable explanation of what changed between two firm versions.
// It omits storage metadata and keys participants by ref so a reorder never masquerades as a change.

const ROOT_METADATA = new Set(["id", "schemaVersion", "revision", "createdAt", "updatedAt"]);

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function participantsByRef(value) {
  return new Map((Array.isArray(value) ? value : []).map((entry) => [entry?.ref, entry]));
}

function walk(before, after, path, changes) {
  if (same(before, after)) return;
  if (path.length === 1 && ROOT_METADATA.has(path[0])) return;

  if (path.at(-1) === "agents" && (Array.isArray(before) || Array.isArray(after))) {
    const beforeByRef = participantsByRef(before);
    const afterByRef = participantsByRef(after);
    const refs = [...new Set([...beforeByRef.keys(), ...afterByRef.keys()])].filter(Boolean).sort();
    for (const ref of refs) walk(beforeByRef.get(ref), afterByRef.get(ref), [...path, ref], changes);
    return;
  }

  const beforeObject = before && typeof before === "object" && !Array.isArray(before);
  const afterObject = after && typeof after === "object" && !Array.isArray(after);
  if (beforeObject || afterObject) {
    const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])].sort();
    for (const key of keys) walk(before?.[key], after?.[key], [...path, key], changes);
    return;
  }

  changes.push({
    path: path.join("."),
    before: before === undefined ? null : before,
    after: after === undefined ? null : after,
  });
}

export function diffFirmConfigurations(before, after) {
  const changes = [];
  walk(before ?? {}, after ?? {}, [], changes);
  return changes;
}
