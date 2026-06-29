import { Plug } from "lucide-react";
import { useBrandGlyph } from "@/lib/brandGlyph";

// The brand logo, drawn from the real service SVG. Monochrome (currentColor) by default so the
// canvas stays calm (DESIGN.md: "color for meaning only"); pass `brand` to render the service's
// official color — used when the card is focused, so the logo blooms to its real color only where
// your attention already is. Falls back to a neutral plug for an unrecognized service.
export function BrandGlyph({
  serverId, brand = false, size = 16,
}: { serverId: string; brand?: boolean; size?: number }) {
  const icon = useBrandGlyph(serverId);
  if (!icon) return <Plug width={size} height={size} aria-hidden />;
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      role="img"
      aria-label={icon.title}
      fill={brand ? `#${icon.hex}` : "currentColor"}
      style={{ transition: "fill 200ms var(--ease)" }}
    >
      <path d={icon.path} />
    </svg>
  );
}
