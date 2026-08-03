import { resolveMarkdownFileLinkTarget } from "./markdown-links";

export type ChatMarkdownImageSource =
  | { readonly _tag: "remote"; readonly url: string }
  | { readonly _tag: "workspace"; readonly path: string }
  | { readonly _tag: "unsupported"; readonly source: string };

/** Classify markdown image sources without granting arbitrary filesystem access. */
export function resolveChatMarkdownImageSource(
  source: string | undefined,
  cwd: string | undefined,
): ChatMarkdownImageSource {
  const normalized = source?.trim() ?? "";
  if (normalized.length === 0) return { _tag: "unsupported", source: normalized };

  try {
    const url = new URL(normalized);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return { _tag: "remote", url: url.toString() };
    }
  } catch {
    // Workspace paths are intentionally resolved below.
  }

  const workspacePath = resolveMarkdownFileLinkTarget(normalized, cwd);
  return workspacePath
    ? { _tag: "workspace", path: workspacePath }
    : { _tag: "unsupported", source: normalized };
}

export function chatMarkdownImageName(source: ChatMarkdownImageSource, alt: string | undefined) {
  const label = alt?.trim();
  if (label) return label;
  const value =
    source._tag === "remote"
      ? new URL(source.url).pathname
      : source._tag === "workspace"
        ? source.path
        : source.source;
  const basename = value.slice(Math.max(value.lastIndexOf("/"), value.lastIndexOf("\\")) + 1);
  return basename || "Image";
}
