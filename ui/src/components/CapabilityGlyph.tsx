import { capabilityMark, type Capability } from "@/lib/capabilities";

// One capability's brand logo — the real open-licensed mark in its own color where one exists, else a
// clean lettermark tile in the brand's tone. Shared so the workspace rail and a capability dropped onto
// the canvas draw the exact same mark (the MCP brand-glyph path misses a few of these, so this reads the
// capability's own mark set, which covers every capability). The mark is the only place brand color
// lives — it's identity, not decoration.
export function CapabilityGlyph({ cap, size = 18 }: { cap: Capability; size?: number }) {
  const mark = capabilityMark(cap);
  if (mark) {
    return (
      <span className="cap-glyph" style={{ ["--brand" as string]: `#${mark.hex}` }}>
        <svg viewBox="0 0 24 24" width={size} height={size} fill={`#${mark.hex}`} role="img" aria-label={cap.name}>
          <path d={mark.path} />
        </svg>
      </span>
    );
  }
  const lm = cap.lettermark!;
  return (
    <span
      className="cap-glyph cap-glyph-letter"
      style={{ ["--brand" as string]: lm.hex, color: lm.hex, fontSize: size * 0.62 }}
      aria-label={cap.name}
    >
      {lm.text}
    </span>
  );
}
