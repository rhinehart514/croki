const ACRONYMS = new Set(["ai", "api", "cse", "cta", "dm", "gtm", "html", "mcp", "ny", "pr", "sdk", "sms", "ub", "ui", "url", "ux"]);
const PROPER_WORDS = new Set(["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"]);

function readableHeading(value: string) {
  const lower = value.toLocaleLowerCase();
  const sentence = lower.replace(/\b[a-z]+\b/g, (word) => ACRONYMS.has(word) ? word.toLocaleUpperCase() : PROPER_WORDS.has(word) ? word.charAt(0).toLocaleUpperCase() + word.slice(1) : word);
  return sentence.charAt(0).toLocaleUpperCase() + sentence.slice(1);
}

function isStandaloneHeading(value: string) {
  const letters = value.replace(/[^A-Za-z]/g, "");
  const uppercaseLead = /^[A-Z][A-Z0-9 /&,'-]{5,}(?=\s*(?:—|\(|:|$))/.test(value);
  return letters.length >= 6 && value.length <= 120 && (value === value.toLocaleUpperCase() || uppercaseLead);
}

/** Turn the memo-shaped plain text agents already produce into conservative Markdown hierarchy. */
export function normalizeGeneratedDocument(value: string) {
  const lines = value.replaceAll("\r\n", "\n").split("\n");
  let firstContent = true;
  return lines.map((rawLine) => {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();
    if (!trimmed) return "";
    if (/^#{1,6}\s|^```|^>|^\|/.test(trimmed)) {
      firstContent = false;
      return line;
    }
    const labeled = trimmed.match(/^(Window|Cadence for all|Disqualify|First action(?:\s*\([^)]*\))?):\s*(.+)$/i);
    if (labeled) {
      firstContent = false;
      return `**${readableHeading(labeled[1])}:** ${labeled[2]}`;
    }
    if (isStandaloneHeading(trimmed)) {
      const level = firstContent ? "#" : "##";
      firstContent = false;
      return `${level} ${readableHeading(trimmed)}`;
    }
    firstContent = false;
    if (/^\s+[-*]\s/.test(line)) return trimmed;
    const channel = trimmed.match(/^(Channel\s+[A-Z0-9]+\s+—\s+.+)$/);
    if (channel) return `### ${channel[1]}`;
    return line;
  }).join("\n");
}
