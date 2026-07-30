import type {
  CrokiContext,
  CrokiContextEdge,
  CrokiContextNode,
  CrokiNodeKind,
} from "@t3tools/shared/crokiContext";
import { Archive, Check, ChevronRight, Sparkles, X } from "lucide-react";

import { cn } from "~/lib/utils";
import { Button } from "../ui/button";
import {
  crokiDomainForView,
  crokiNodeDomain,
  crokiNodeKindLabel,
  crokiNodeMatchesView,
  crokiViewEmptyCopy,
  type CrokiCanvasView,
} from "./crokiCanvasLanguage";
import { groupCrokiNodes } from "./crokiCanvasModel";
import { CrokiCanvasRelationships } from "./CrokiCanvasRelationships";

interface CrokiCanvasOverviewProps {
  readonly context: CrokiContext;
  readonly edgeFrom: string;
  readonly edgeRelation: string;
  readonly edgeTo: string;
  readonly onAddEdge: () => void;
  readonly onAddNode: (kind: CrokiNodeKind) => void;
  readonly onAdopt: (id: string) => void;
  readonly onBuildFromRepository?: () => void;
  readonly onDeleteEdge: (edge: CrokiContextEdge) => void;
  readonly onEdgeFromChange: (value: string) => void;
  readonly onEdgeRelationChange: (value: string) => void;
  readonly onEdgeToChange: (value: string) => void;
  readonly onReject: (id: string) => void;
  readonly onRetire: (id: string) => void;
  readonly onSelect: (id: string) => void;
  readonly view?: CrokiCanvasView;
}

export function CrokiCanvasOverview(props: CrokiCanvasOverviewProps) {
  const view = props.view ?? "product";
  const visibleNodes = props.context.nodes.filter((node) => crokiNodeMatchesView(node, view));
  const visibleIds = new Set(visibleNodes.map((node) => node.id));
  const visibleContext: CrokiContext = {
    ...props.context,
    nodes: visibleNodes,
    edges: props.context.edges.filter(
      (edge) => visibleIds.has(edge.from) && visibleIds.has(edge.to),
    ),
  };
  const groups = groupCrokiNodes(visibleContext);
  const names = new Map(visibleNodes.map((node) => [node.id, node.title]));
  const isReview = view === "review";
  const domain = crokiDomainForView(view);

  return (
    <div className="space-y-5">
      {view === "product" && props.context.nodes.length === 0 && props.onBuildFromRepository ? (
        <section
          aria-label="Build Canvas from repository"
          className="border-y border-border/60 py-3"
        >
          <p className="text-sm font-medium">Start from the repository</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            The agent proposes understanding. You decide what becomes canon.
          </p>
          <Button
            className="mt-2"
            size="sm"
            variant="outline"
            onClick={props.onBuildFromRepository}
          >
            <Sparkles className="size-3.5" aria-hidden />
            Build from repository
          </Button>
        </section>
      ) : null}

      {!isReview ? (
        <section aria-label="Founder-approved understanding">
          <h3 className="mb-2 text-xs font-semibold tracking-wide uppercase">
            Current understanding
          </h3>
          <NodeList
            empty={crokiViewEmptyCopy(view)}
            nodes={groups.current}
            onRetire={props.onRetire}
            onSelect={props.onSelect}
          />
        </section>
      ) : null}

      <section aria-label={isReview ? "Semantic review" : "Proposals in this area"}>
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-semibold tracking-wide uppercase">
              {isReview ? "Semantic review" : "Proposals"}
              {groups.provisional.length > 0 ? (
                <span className="ml-1.5 text-muted-foreground">{groups.provisional.length}</span>
              ) : null}
            </h3>
            {isReview ? (
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Adoption changes the context future agent turns receive.
              </p>
            ) : null}
          </div>
          {!isReview ? (
            <div className="flex items-center gap-1" role="group" aria-label="Add Canvas item">
              {(["intent", "decision", "evidence", "work"] as const).map((kind) => (
                <Button
                  key={kind}
                  className="h-7 px-1.5 text-[10px]"
                  size="sm"
                  variant="ghost"
                  aria-label={`Add ${crokiNodeKindLabel(kind, domain).toLowerCase()}`}
                  title={`Add ${crokiNodeKindLabel(kind, domain).toLowerCase()}`}
                  onClick={() => props.onAddNode(kind)}
                >
                  {crokiNodeKindLabel(kind, domain)}
                </Button>
              ))}
            </div>
          ) : null}
        </div>
        <NodeList
          empty={isReview ? crokiViewEmptyCopy("review") : "No proposals in this area."}
          nodes={groups.provisional}
          onAdopt={props.onAdopt}
          onReject={props.onReject}
          onSelect={props.onSelect}
          showProvenance={isReview}
        />
      </section>

      {!isReview && visibleNodes.length > 1 ? (
        <details>
          <summary className="cursor-pointer text-xs font-semibold tracking-wide uppercase text-muted-foreground">
            Relationships · {visibleContext.edges.length}
          </summary>
          <div className="mt-2">
            <CrokiCanvasRelationships names={names} {...props} context={visibleContext} />
          </div>
        </details>
      ) : null}

      {groups.retired.length > 0 ? (
        <details>
          <summary className="cursor-pointer text-xs font-semibold tracking-wide uppercase text-muted-foreground">
            Retired · {groups.retired.length}
          </summary>
          <div className="mt-2">
            <NodeList nodes={groups.retired} onSelect={props.onSelect} empty="" />
          </div>
        </details>
      ) : null}
    </div>
  );
}

interface NodeListProps {
  readonly empty: string;
  readonly nodes: readonly CrokiContextNode[];
  readonly onAdopt?: (id: string) => void;
  readonly onReject?: (id: string) => void;
  readonly onRetire?: (id: string) => void;
  readonly onSelect: (id: string) => void;
  readonly showProvenance?: boolean;
}

function NodeList(props: NodeListProps) {
  if (props.nodes.length === 0) {
    return (
      <p className="border-l border-border px-3 py-2 text-xs text-muted-foreground">
        {props.empty}
      </p>
    );
  }
  return (
    <div className="divide-y divide-border/60 border-y border-border/60">
      {props.nodes.map((node) => (
        <article key={node.id} className="group flex min-h-12 items-center gap-2 py-2">
          <button
            type="button"
            className="min-w-0 flex-1 text-left"
            onClick={() => props.onSelect(node.id)}
          >
            <span className="block text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
              {crokiNodeKindLabel(node.kind, crokiNodeDomain(node))}
              {props.showProvenance
                ? ` · ${crokiNodeDomain(node)} · ${node.origin ?? "agent"}`
                : ""}
            </span>
            <span
              className={cn(
                "block truncate text-sm",
                node.status === "retired" && "text-muted-foreground line-through",
              )}
            >
              {node.title}
            </span>
          </button>
          {props.onAdopt ? (
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label={`Adopt ${node.title}`}
              title="Adopt into canon"
              onClick={() => props.onAdopt?.(node.id)}
            >
              <Check className="size-3" aria-hidden />
            </Button>
          ) : null}
          {props.onReject ? (
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label={`Reject ${node.title}`}
              title="Reject proposal"
              onClick={() => props.onReject?.(node.id)}
            >
              <X className="size-3" aria-hidden />
            </Button>
          ) : props.onRetire ? (
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label={`Retire ${node.title}`}
              title="Retire"
              onClick={() => props.onRetire?.(node.id)}
            >
              <Archive className="size-3" aria-hidden />
            </Button>
          ) : null}
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label={`Edit ${node.title}`}
            onClick={() => props.onSelect(node.id)}
          >
            <ChevronRight className="size-3" aria-hidden />
          </Button>
        </article>
      ))}
    </div>
  );
}
