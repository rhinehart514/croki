// CSV source — founder-provided structured input without an external service.
// The browser reads a selected file as text and stores it in node config; runs
// parse that durable text locally. No upload or network transfer is required.

export const meta = {
  id: "csv",
  name: "CSV input",
  category: "source",
  description: "Parses founder-provided CSV text into structured workflow items.",
  envKey: null,
  stub: false,
  sourceOfTruth: ["contacts", "signals"],
};

function parseRow(line) {
  const cells = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(current.trim());
      current = "";
    } else current += char;
  }
  cells.push(current.trim());
  if (quoted) throw new Error("CSV contains an unterminated quoted field.");
  return cells;
}

export function parseCsv(text) {
  const lines = String(text ?? "").split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return [];
  const headers = parseRow(lines[0]).map((header) => header.trim());
  if (!headers.length || headers.some((header) => !header)) throw new Error("CSV requires a non-empty header row.");
  return lines.slice(1).map((line, index) => {
    const values = parseRow(line);
    const item = Object.fromEntries(headers.map((header, cell) => [header, values[cell] ?? ""]));
    return {
      type: item.type || "input",
      id: item.id || item.email || item.url || `csv-${index + 1}`,
      ...item,
    };
  });
}

export async function run(node) {
  const items = parseCsv(node.config?.csv);
  return { ok: true, items, meta: { count: items.length, source: "csv" } };
}
