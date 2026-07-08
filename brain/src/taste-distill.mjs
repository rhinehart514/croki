function hasItems(value) {
  return Array.isArray(value) && value.length > 0;
}

function normalizeList(value) {
  return Array.isArray(value) ? value : [];
}

export function distillTaste(profile, { maxRules = 5, maxExampleChars = 160 } = {}) {
  if (!profile) return null;

  const approved = normalizeList(profile.approved);
  const rejected = normalizeList(profile.rejected);
  const edits = normalizeList(profile.edits);
  const killedAngles = normalizeList(profile.ideaTaste?.killedAngles);
  const keptAngles = normalizeList(profile.ideaTaste?.keptAngles);

  if (
    !hasItems(approved)
    && !hasItems(rejected)
    && !hasItems(edits)
    && !hasItems(killedAngles)
    && !hasItems(keptAngles)
  ) {
    return null;
  }

  const trunc = (text) => {
    const normalized = String(text ?? "").replace(/\s+/g, " ").trim();
    if (normalized.length <= maxExampleChars) return normalized;
    return `${normalized.slice(0, maxExampleChars)}…`;
  };

  const rules = [];
  if (edits.length) {
    rules.push(
      `Correct toward the founder's own edits — they rewrite your drafts. Most recent: "${trunc(edits[0].from)}" → "${trunc(edits[0].to)}".`,
    );
  }
  if (approved.length) {
    rules.push(`Match the voice the founder approved (e.g. "${trunc(approved[0])}").`);
  }
  if (rejected.length) {
    rules.push(`Steer clear of what the founder rejected (e.g. "${trunc(rejected[0])}").`);
  }
  if (killedAngles.length) {
    rules.push(`Do not pitch these angles again: ${killedAngles.map((a) => a.angle).join(", ")}.`);
  }
  if (keptAngles.length) {
    rules.push(`Lean into these angles: ${keptAngles.map((a) => a.angle).join(", ")}.`);
  }

  return {
    rules: rules.slice(0, maxRules),
    observed: {
      approved: profile.counts?.approved ?? profile.approved?.length ?? 0,
      rejected: profile.counts?.rejected ?? profile.rejected?.length ?? 0,
      edits: profile.counts?.edits ?? profile.edits?.length ?? 0,
      killedAngles: profile.counts?.killedAngles ?? profile.ideaTaste?.killedAngles?.length ?? 0,
      keptAngles: profile.counts?.keptAngles ?? profile.ideaTaste?.keptAngles?.length ?? 0,
    },
  };
}

export function renderDistilledTaste(distilled) {
  if (!distilled?.rules?.length) return "";
  const o = distilled.observed ?? {};
  return [
    "What the founder has taught you so far (match this — it is voice guidance only; the approval gate still decides what actually sends):",
    ...distilled.rules.map((rule) => `- ${rule}`),
    `Observed: approved ${o.approved ?? 0}, rejected ${o.rejected ?? 0}, edits ${o.edits ?? 0}, killed angles ${o.killedAngles ?? 0}.`,
  ].join("\n");
}
