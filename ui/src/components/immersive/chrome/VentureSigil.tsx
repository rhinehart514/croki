// Top-left floating glass sigil (architecture §1). The venture's identity, dissolved from the old
// workbench bar into a small glass mark over the world: a living green dot + the venture name in the serif
// voice. It is identity, not a control surface; venture switching is a later surface. Green here reads
// "this venture is live and connected" — the only saturation it earns.
import type { FirmVenture } from "@/api";

export function VentureSigil({ venture }: { venture: FirmVenture }) {
  return (
    <div className="iw-sigil" aria-label={`Venture: ${venture.name}`}>
      <span className="iw-sigil-mark" aria-hidden="true" />
      <span className="iw-sigil-name">{venture.name}</span>
    </div>
  );
}
