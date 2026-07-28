// Adapter: a raw wall effect or staged artifact → the concrete thing the founder reviews. A code change
// becomes a real diff; a drafted message/page/list becomes a preview. This is the "review the produced
// thing, not the explanation" seam — it decides which review primitive the detail surface renders.
import type { ReviewArtifact } from "@/components/review";

export type ResolvedArtifact =
  | { kind: "diff"; diff: string; stat: string | null }
  | { kind: "preview"; artifact: ReviewArtifact }
  | { kind: "unsupported"; sourceKind: string | null }
  | null;

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function resolveEffectArtifact(effect: Record<string, unknown>): ResolvedArtifact {
  const diff = str(effect.diff) ?? str(effect.patch) ?? str(effect.artifact);
  const kind = str(effect.kind)?.toLowerCase();
  if (diff && (kind === "product-change" || diff.includes("@@") || diff.startsWith("diff --git") || diff.startsWith("--- "))) {
    return { kind: "diff", diff, stat: str(effect.diffStat) ?? str(effect.summary) };
  }
  const image = str(effect.image) ?? str(effect.screenshot);
  if (image && (image.startsWith("data:image") || /\.(png|jpe?g|gif|webp|svg)$/i.test(image))) {
    return { kind: "preview", artifact: { kind: "image", src: image, caption: str(effect.title) ?? undefined } };
  }
  const html = str(effect.html) ?? str(effect.preview);
  if (html && html.includes("<")) return { kind: "preview", artifact: { kind: "html", content: html } };
  const body = str(effect.body) ?? str(effect.message) ?? str(effect.draft) ?? str(effect.content) ?? str(effect.text);
  if (body) {
    const markdownish = /(^|\n)#{1,3}\s|\n\n|\*\*|\n[-*]\s/.test(body);
    return { kind: "preview", artifact: { kind: markdownish ? "markdown" : "text", content: body } };
  }
  return null;
}

/** A bet's staged artifact content is unknown-typed; coerce to a reviewable preview. */
export function resolveStagedArtifact(content: unknown): ResolvedArtifact {
  if (content == null) return null;
  if (typeof content === "object" && !Array.isArray(content)) {
    const value = content as Record<string, unknown>;
    const kind = str(value.kind)?.toLowerCase() ?? null;
    if (kind === "document") {
      const format = str(value.format)?.toLowerCase();
      const body = typeof value.content === "string" ? value.content : null;
      if (body != null && ["markdown", "text", "html", "code"].includes(format ?? "")) {
        return { kind: "preview", artifact: { kind: format as ReviewArtifact["kind"], content: body } };
      }
    }
    if (kind && ["markdown", "text", "html", "code"].includes(kind) && typeof value.content === "string") {
      return { kind: "preview", artifact: { kind: kind as ReviewArtifact["kind"], content: value.content } };
    }
    if (kind === "image" && str(value.src)) {
      return { kind: "preview", artifact: { kind: "image", src: str(value.src)!, caption: str(value.caption) ?? undefined } };
    }
    return resolveEffectArtifact(value) ?? { kind: "unsupported", sourceKind: kind };
  }
  if (typeof content !== "string") return { kind: "unsupported", sourceKind: null };
  const text = String(content).trim();
  if (!text) return null;
  if (text.includes("@@") || text.startsWith("diff --git")) return { kind: "diff", diff: text, stat: null };
  const markdownish = /(^|\n)#{1,3}\s|\n\n|\*\*/.test(text);
  return { kind: "preview", artifact: { kind: markdownish ? "markdown" : "text", content: text } };
}
