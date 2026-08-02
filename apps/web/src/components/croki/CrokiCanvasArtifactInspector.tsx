import { ExternalLink, X } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";

import type { CrokiCanvasArtifactReference } from "@croki/shared/crokiCanvasArtifact";
import type { CrokiContextReference } from "@croki/shared/crokiContext";

import { ScrollArea } from "../ui/scroll-area";
import { crokiCanvasArtifactLayoutBucket } from "./crokiCanvasArtifactLayout";
import type {
  CrokiCanvasArtifactEdgeLike,
  CrokiCanvasArtifactNodeLike,
} from "./crokiCanvasArtifactTypes";

export function CrokiCanvasArtifactInspector(props: {
  readonly nodes: readonly CrokiCanvasArtifactNodeLike[];
  readonly allNodes: readonly CrokiCanvasArtifactNodeLike[];
  readonly edges: readonly CrokiCanvasArtifactEdgeLike[];
  readonly onClear: () => void;
  readonly onOpenReference?: (reference: CrokiContextReference) => void;
  readonly onUse: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [bucket, setBucket] = useState<"wide" | "medium" | "narrow">("wide");
  useLayoutEffect(() => {
    const element = rootRef.current?.parentElement;
    if (!element) return;
    const measure = () =>
      setBucket(crokiCanvasArtifactLayoutBucket(element.getBoundingClientRect().width));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const primary = props.nodes[0];
  if (!primary) return null;
  const related = props.edges.filter((edge) =>
    props.nodes.some((node) => node.id === edge.from || node.id === edge.to),
  );
  const nodeTitle = new Map(props.allNodes.map((node) => [node.id, node.title]));
  const className =
    bucket === "wide"
      ? "absolute inset-y-0 right-0 z-20 w-[min(380px,42%)] border-l border-white/15 bg-black"
      : bucket === "medium"
        ? "absolute inset-y-0 right-0 z-20 w-[42%] border-l border-white/15 bg-black"
        : "absolute inset-x-0 bottom-0 z-20 max-h-[62%] border-t border-white/15 bg-black";
  return (
    <aside ref={rootRef} className={className} aria-label="Canvas inspector">
      <ScrollArea className="h-full">
        <div className="space-y-6 p-5 pb-8">
          <header className="flex items-start gap-4 border-b border-white/10 pb-4">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-[0.12em] text-zinc-600">Selection</p>
              <h2 className="mt-1 text-sm font-medium text-white">
                {props.nodes.length === 1
                  ? primary.title
                  : `${props.nodes.length} objects selected`}
              </h2>
            </div>
            <button
              type="button"
              aria-label="Close Canvas inspector"
              className="text-zinc-500 hover:text-white"
              onClick={props.onClear}
            >
              <X className="size-4" aria-hidden />
            </button>
          </header>
          {props.nodes.length > 1 ? (
            <ul className="space-y-2 border-b border-white/10 pb-5">
              {props.nodes.map((node) => (
                <li key={node.id} className="text-xs text-zinc-300">
                  {node.title}
                </li>
              ))}
            </ul>
          ) : null}
          <section>
            <p className="text-[10px] uppercase tracking-[0.12em] text-zinc-600">Details</p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-200">
              {primary.body || "No additional detail was provided."}
            </p>
          </section>
          <section>
            <p className="text-[10px] uppercase tracking-[0.12em] text-zinc-600">Why it matters</p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-300">
              {primary.whyItMatters ||
                primary.why ||
                primary.consequence ||
                "No consequence was provided."}
            </p>
          </section>
          {primary.references && primary.references.length > 0 ? (
            <section>
              <p className="text-[10px] uppercase tracking-[0.12em] text-zinc-600">Evidence</p>
              <ul className="mt-2 space-y-2">
                {primary.references.map((reference) => (
                  <li key={referenceKey(reference)}>
                    <button
                      type="button"
                      className="flex w-full items-start gap-2 text-left text-xs text-zinc-300 hover:text-white"
                      onClick={() => props.onOpenReference?.(toCrokiContextReference(reference))}
                      disabled={!props.onOpenReference}
                    >
                      <ExternalLink className="mt-0.5 size-3 shrink-0 text-zinc-600" aria-hidden />
                      <span>{referenceLabel(reference)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {related.length > 0 ? (
            <section>
              <p className="text-[10px] uppercase tracking-[0.12em] text-zinc-600">Relationships</p>
              <ul className="mt-2 space-y-2">
                {related.map((edge) => (
                  <li
                    key={`${edge.from}:${edge.relation}:${edge.to}`}
                    className="text-xs text-zinc-400"
                  >
                    <span className="text-zinc-600">{edge.relation}</span>{" "}
                    {nodeTitle.get(edge.from === primary.id ? edge.to : edge.from) ??
                      "Presented object"}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <button
            type="button"
            className="h-8 w-full border border-white/20 text-[11px] text-zinc-200 hover:border-white/50 hover:text-white"
            onClick={props.onUse}
          >
            Use in Thread
          </button>
        </div>
      </ScrollArea>
    </aside>
  );
}

export function CrokiCanvasArtifactSelectionSummary(props: {
  readonly nodes: readonly CrokiCanvasArtifactNodeLike[];
  readonly onClear: () => void;
  readonly onUse: () => void;
}) {
  return (
    <div
      className="flex shrink-0 items-center gap-3 border-b border-white/10 px-4 py-2"
      aria-label="Canvas selection context"
    >
      <p className="min-w-0 flex-1 truncate text-[11px] text-zinc-300">
        Canvas selection: {props.nodes.map((node) => node.title).join(" · ")}
      </p>
      <button
        type="button"
        className="shrink-0 text-[10px] text-zinc-500 hover:text-white"
        onClick={props.onClear}
      >
        Clear
      </button>
      <button
        type="button"
        className="shrink-0 text-[10px] text-zinc-300 hover:text-white"
        onClick={props.onUse}
      >
        Use in Thread
      </button>
    </div>
  );
}

function referenceKey(reference: CrokiCanvasArtifactReference): string {
  return reference.kind === "file"
    ? `file:${reference.path}:${reference.line ?? ""}`
    : `url:${reference.url}`;
}

function referenceLabel(reference: CrokiCanvasArtifactReference): string {
  return reference.kind === "file"
    ? `${reference.path}${reference.line ? `:${reference.line}` : ""}`
    : reference.url;
}

function toCrokiContextReference(reference: CrokiCanvasArtifactReference): CrokiContextReference {
  if (reference.kind === "url") return reference;
  return {
    kind: "file",
    path: reference.path,
    ...(reference.line !== undefined ? { line: reference.line } : {}),
  };
}
