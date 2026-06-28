// ClarityCard — the content that renders inside a CanvasCard for a ClarityObject.
// A ClarityObject is the durable residue of an Ideate thinking session: a claim, a direction, an
// ICP sharpening, or an open question. The parent wraps this in <CanvasCard>, which provides the
// drag handle, dismiss button, and opaque frame — so this renders the body only: a kind badge,
// the main text, and an optional note.
import type { ClarityObject, ClarityKind } from "@/types";
import "@/styles/clarity-card-content.css";

// ─── kind meta ──────────────────────────────────────────────────────────────────
// Each kind gets a short human label and a stable CSS modifier that carries its quiet tint.
// Four restrained tints, all token-based:
//   claim     → neutral ink tint   (accent — the base token, very muted)
//   direction → proven green tint  (--proven / --proven-soft — named intent, grounded)
//   icp       → blue tint          (raw oklch — no matching semantic token; kept close to the scale)
//   question  → amber/gap tint     (--gap / --gap-soft — the "still open" signal the app already uses)

const KIND_META: Record<ClarityKind, { label: string; modifier: string }> = {
  claim:     { label: "Claim",         modifier: "clarity-badge--claim"     },
  direction: { label: "Direction",     modifier: "clarity-badge--direction"  },
  icp:       { label: "ICP",           modifier: "clarity-badge--icp"        },
  question:  { label: "Open question", modifier: "clarity-badge--question"   },
};

export function ClarityCard({ item }: { item: ClarityObject }) {
  const meta = KIND_META[item.kind];

  // Relative time label — createdAt is an ISO string.
  const created = new Date(item.createdAt);
  const age = Date.now() - created.getTime();
  const timeLabel = age < 60_000
    ? "just now"
    : age < 3_600_000
      ? `${Math.round(age / 60_000)}m ago`
      : age < 86_400_000
        ? `${Math.round(age / 3_600_000)}h ago`
        : created.toLocaleDateString(undefined, { month: "short", day: "numeric" });

  return (
    <div className="clarity-card-content">
      <div className="clarity-card-head">
        <span className={`clarity-badge ${meta.modifier}`}>{meta.label}</span>
        <span className="clarity-card-time">{timeLabel}</span>
      </div>
      <p className="clarity-card-text">{item.text}</p>
      {item.note && (
        <p className="clarity-card-note">{item.note}</p>
      )}
    </div>
  );
}
