import type { RepositoryFile, RepositoryReadyTextFile } from "@/api";
import { ArtifactPreview } from "./ArtifactPreview";

function mediaType(path: string) {
  const extension = path.toLowerCase().split(".").pop();
  return extension === "jpg" || extension === "jpeg" ? "image/jpeg"
    : extension === "gif" ? "image/gif"
      : extension === "webp" ? "image/webp"
        : extension === "svg" ? "image/svg+xml"
          : "image/png";
}

function exactState(file: Exclude<RepositoryFile, { state: "ready" }>) {
  if (file.state === "binary") return {
    title: "Binary file",
    detail: file.message ?? "This file cannot be shown as source text.",
  };
  if (file.state === "oversized") return {
    title: "File exceeds the review limit",
    detail: file.message ?? "Open a smaller source file or narrow the material returned by the agent.",
  };
  return {
    title: "File was removed",
    detail: file.message ?? "This path no longer exists in the isolated workspace.",
  };
}

function SourceLines({ file, selection, onSelect }: {
  file: RepositoryReadyTextFile;
  selection: { startLine: number; endLine: number };
  onSelect: (line: number, extend: boolean) => void;
}) {
  const lines = file.content.split("\n");
  return (
    <div className="repository-source" role="list" aria-label={`${file.path} source lines`}>
      {lines.map((content, index) => {
        const number = file.startLine + index;
        const selected = number >= selection.startLine && number <= selection.endLine;
        return <button
          key={number}
          type="button"
          role="listitem"
          className="repository-source-line"
          data-selected={selected ? "true" : undefined}
          aria-label={`Line ${number}`}
          onClick={(event) => onSelect(number, event.shiftKey)}
        ><span>{number}</span><code>{content || " "}</code></button>;
      })}
    </div>
  );
}

export function RepositoryFileView({ file, selection, onSelect }: {
  file: RepositoryFile | null;
  selection: { startLine: number; endLine: number };
  onSelect: (line: number, extend: boolean) => void;
}) {
  if (!file) return <div className="repository-file-empty">Choose a path to review its exact repository content.</div>;

  if (file.state !== "ready") {
    const state = exactState(file);
    return <div className="repository-file-state" data-state={file.state} role="status">
      <strong>{state.title}</strong>
      <p>{state.detail}</p>
      <code>{file.path}</code>
      {file.size != null ? <small>{file.size.toLocaleString()} bytes</small> : null}
    </div>;
  }

  if (file.presentation === "image") {
    return <ArtifactPreview artifact={{
      kind: "image",
      src: `data:${mediaType(file.path)};base64,${file.content}`,
      caption: file.path,
    }} />;
  }

  return <div className="repository-file-ready" data-presentation={file.presentation}>
    {file.presentation === "markdown" ? <details className="repository-file-preview">
      <summary>Rendered Markdown</summary>
      <ArtifactPreview artifact={{ kind: "markdown", content: file.content, caption: file.path }} />
    </details> : null}
    {file.presentation === "web" && /^\s*(?:<!doctype|<html|<svg)/i.test(file.content)
      ? <details className="repository-file-preview">
        <summary>Sandboxed preview</summary>
        <ArtifactPreview artifact={{ kind: "html", content: file.content, caption: file.path }} />
      </details>
      : null}
    <SourceLines file={file} selection={selection} onSelect={onSelect} />
  </div>;
}
