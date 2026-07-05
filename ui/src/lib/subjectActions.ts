// The Claude-action chips a selected card offers — the same set the composer's attached header and the
// card-detail inspector both render, so the two never drift. Each is phrased as something the founder
// ASKS for ("Sharpen this", "Draft the first message"), never a system verb, and clicking one only
// drops the phrasing into the composer input — editable, never a bare fire.
const SUBJECT_ACTIONS: Record<string, string[]> = {
  offer: ["Make it lower-friction", "Turn it into a paid pilot"],
  buyer: ["Narrow this buyer", "What's their trigger?"],
  pain: ["Who feels this most?"],
  job: ["Who feels this most?"],
  channel: ["Draft the first message", "Who do I send this to?"],
  message: ["Make it shorter", "Make it feel personal"],
  proof_point: ["Where's the real evidence?"],
  value_prop: ["Where's the real evidence?"],
  trigger: ["Why is now the moment?"],
  gate: ["Stage this to review"],
  run: ["What changed after this run?"],
};

export function subjectActions(kind: string): string[] {
  const universal = ["Sharpen this", "Find evidence", "Give me 3 variants"];
  const extra = SUBJECT_ACTIONS[kind] ?? [];
  // Keep it to at most four chips so the header/inspector foot stays scannable, extras first (they're
  // the most specific to what's selected), then fill from the universal set.
  return [...extra, ...universal].slice(0, 4);
}
