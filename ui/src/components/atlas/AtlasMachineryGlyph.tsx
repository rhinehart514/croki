import type { AtlasNode } from "./atlasTypes";

export function AtlasMachineryGlyph({ counts }: { counts: AtlasNode["data"]["machineryCounts"] }) {
  if (!counts?.length) return null;
  return (
    <span className="atlas-machinery-glyph" aria-label={counts.map((item) => `${item.count} ${item.label}`).join(", ")}>
      <span aria-hidden="true">{counts.map((item) => <i key={item.label} data-kind={item.label} />)}</span>
      <small>{counts.map((item) => `${item.count} ${item.label}`).join(" · ")}</small>
    </span>
  );
}
