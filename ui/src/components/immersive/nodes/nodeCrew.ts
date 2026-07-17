// Crew face helpers for immersive world nodes — kept out of the component file so fast-refresh stays
// component-only. Crew color tokens are already declared in index.css; deterministic mapping by
// ref/name so faces read the same as the legacy crew nodes. Unknown refs fall back to ink so nothing
// invents a new hue.
const CREW_TOKEN: Record<string, string> = {
  yara: "var(--yara)", mira: "var(--mira)", soren: "var(--soren)", kai: "var(--kai)",
};

export function crewColor(ref: string | undefined): string {
  if (!ref) return "var(--ink-3)";
  const key = ref.toLowerCase();
  for (const name of Object.keys(CREW_TOKEN)) if (key.includes(name)) return CREW_TOKEN[name];
  return "var(--ink-3)";
}

export function initialFor(nameOrRef: string): string {
  return (nameOrRef.trim()[0] ?? "·").toUpperCase();
}
