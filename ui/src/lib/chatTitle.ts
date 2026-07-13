import type { OperatorSessionSummary } from "@/types";
import { founderGoalLine } from "@/lib/labels";

// A chat's name is a SHORT, readable title for the conversation — never the raw prompt the founder
// typed. It starts from the clean goal line (founderGoalLine strips the composer's engineering tail —
// "Ideate 2-3 shapes…", win-event ids, scan bookkeeping — so a title never reads "i want to ideate
// diff…"), drops a leading first-person throat-clear ("I want to", "Help me", "Let's"), and keeps a
// compact phrase. Two chats can still start with the same words; distinctChatTitles disambiguates those
// so no two ever render identically. Shared by the composer's tabs and the rail's chat history.
export function chatTabName(s: OperatorSessionSummary): string {
  const cleaned = founderGoalLine(s.goal) || (s.summary ?? "").trim() || (s.goal ?? "").replace(/^\[[^\]]*\]\s*/, "").trim();
  if (!cleaned) return "Untitled chat";
  // Drop a leading first-person framing so the name leads with the actual intent, not "I want to".
  const deframed = cleaned.replace(/^\s*(?:i\s+(?:want|need|would like|'d like)\s+to|i\s+wanna|help me|let'?s|can you|please|could you)\s+/i, "").trim();
  const core = deframed || cleaned;
  // Keep it to a short phrase — the first clause (stop at a comma / dash / colon) capped at a few words —
  // so titles stay compact and a reader distinguishes them by words, not by where the ellipsis lands.
  const firstClause = core.split(/\s*[—–,:;]\s+/)[0].trim() || core;
  const words = firstClause.split(/\s+/);
  const short = words.length > 6 ? words.slice(0, 6).join(" ") + "…" : firstClause;
  const titled = short.charAt(0).toUpperCase() + short.slice(1);
  return titled || "Untitled chat";
}

// Names for every chat in the roster, guaranteed distinct. Most get their plain chatTabName; when two
// or more would render the SAME label (same goal prefix), each colliding one gets a "· 1 / · 2 …" suffix
// in creation order, so the founder can always tell two parallel chats apart. Keyed by session id.
export function distinctTabNames(roster: OperatorSessionSummary[]): Record<string, string> {
  const byName = new Map<string, OperatorSessionSummary[]>();
  for (const s of roster) {
    const name = chatTabName(s);
    const group = byName.get(name) ?? [];
    group.push(s);
    byName.set(name, group);
  }
  const out: Record<string, string> = {};
  for (const [name, group] of byName) {
    if (group.length === 1) { out[group[0].id] = name; continue; }
    group
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .forEach((s, i) => { out[s.id] = `${name} · ${i + 1}`; });
  }
  return out;
}
