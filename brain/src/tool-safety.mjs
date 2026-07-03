// Operator tool-safety guard — the single source of truth for which tool NAMES may ever be handed to a
// rented model, on ANY runtime path (the MCP bridge to a Claude Code subprocess AND the direct-Anthropic
// in-process loop). It exists so the two paths can never drift: a tool that a future edit adds is refused
// on both doors by the SAME regex, not two copies that fall out of sync.
//
// Safety by construction: the operator toolset has no approve / send / publish / deploy / charge tool,
// and no idea kill/keep/verdict tool. The only path past a founder gate is the founder resolving it
// inside GTM IDE. These assertions enforce that invariant so a future tool addition can never silently
// hand outbound power — or an idea verdict — to the model.

const FORBIDDEN_TOOL = /approve|send|publish|deploy|charge/i;
// An idea VERDICT — killing or keeping a generated idea — is a founder act, exactly like clearing a
// gate. The operator may `ideate` (generate + pause), but deciding which idea lives or becomes work is
// resolved off the agent surface (resolveOperatorIdeas), never by a tool the model can call. This guards
// against a future kill/keep/verdict tool ever leaking onto the model's door. `ideate` itself does not
// match (it neither kills nor keeps), so the generate-and-pause move stays available.
const FORBIDDEN_IDEA_VERDICT = /idea[_-]?(kill|keep|verdict|decide|pick)|(kill|keep|verdict)[_-]?idea/i;

// Defense in depth: refuse to expose anything that could act on the outside world. Gates are the
// founder's alone; the model can never approve one.
export function assertSafeTool(name) {
  if (FORBIDDEN_TOOL.test(name)) {
    throw new Error(`Refusing to expose operator tool "${name}" to a subprocess: it matches an outbound/approval verb.`);
  }
  if (FORBIDDEN_IDEA_VERDICT.test(name)) {
    throw new Error(`Refusing to expose operator tool "${name}" to a subprocess: killing or keeping an idea is a founder act, not an agent tool.`);
  }
  return name;
}

// Filter a tool list down to the safe-to-expose set, asserting each name. Any forbidden tool throws —
// it never silently drops one, so a mis-added outbound tool fails loud instead of being quietly stripped.
export function filterSafeTools(tools = []) {
  return tools.filter((tool) => {
    assertSafeTool(tool.name);
    return true;
  });
}
