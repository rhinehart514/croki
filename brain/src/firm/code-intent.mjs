const IMPLEMENTATION = /\b(implement|code|fix|debug|refactor|wire up|add (?:a |the )?(?:test|route|component|endpoint|feature)|change (?:the )?(?:code|ui|app|implementation)|edit (?:the )?(?:code|repo|repository)|write (?:the )?(?:code|tests?)|make [^.!?]{0,80} work)\b/i;
const NON_IMPLEMENTATION = /^\s*(?:explain|summarize|research|compare|review|critique|inspect|find|locate|tell me|what|why|how)\b/i;

export function isCodingDirection(goal, target = null) {
  if (target?.execution === "code") return true;
  if (target?.execution === "conversation") return false;
  const text = String(goal ?? "").trim();
  if (!text || NON_IMPLEMENTATION.test(text)) return false;
  return IMPLEMENTATION.test(text);
}
