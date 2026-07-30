import type {
  CrokiContext,
  CrokiContextEdge,
  CrokiContextNode,
  CrokiNodeKind,
} from "@t3tools/shared/crokiContext";
import { Archive, Check, ChevronRight, Sparkles, X } from "lucide-react";

import { cn } from "~/lib/utils";
import { Button } from "../ui/button";
import { groupCrokiNodes } from "./crokiCanvasModel";
import { CrokiCanvasRelationships } from "./CrokiCanvasRelationships";

const KIND_LABEL: Record<CrokiNodeKind, string> = {
  intent: "Intent",
  decision: "Decision",
  evidence: "Evidence",
  work: "Work",
};

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
}

export function CrokiCanvasOverview(props: CrokiCanvasOverviewProps) {
  const groups = groupCrokiNodes(props.context);
  const names = new Map(props.context.nodes.map((node) => [node.id, node.title]));

  return (
    <div className="space-y-5">
      {props.context.nodes.length === 0 && props.onBuildFromRepository ? (
        <section
          aria-label="Build Canvas from repository"
          className="border-y border-border/60 py-3"
        >
          <p className="text-sm font-medium">Start from the repository</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Generated items arrive as provisional suggestions for founder review.
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
      <section aria-label="Founder-approved canon">
        <h3 className="mb-2 text-xs font-semibold tracking-wide uppercase">
          Founder-approved canon
        </h3>
        <NodeList
          empty="No approved product truth yet."
          nodes={groups.current}
          onRetire={props.onRetire}
          onSelect={props.onSelect}
        />
      </section>

      <section aria-label="Provisional review queue">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold tracking-wide uppercase">
            Review queue
            {groups.provisional.length > 0 ? (
              <span className="ml-1.5 text-muted-foreground">{groups.provisional.length}</span>
            ) : null}
          </h3>
          <div className="flex items-center gap-1" role="group" aria-label="Add Canvas item">
            {(["intent", "decision", "evidence", "work"] as const).map((kind) => (
              <Button
                key={kind}
                className="h-7 px-1.5 text-[10px]"
                size="sm"
                variant="ghost"
                aria-label={`Add ${KIND_LABEL[kind].toLowerCase()}`}
                title={`Add ${KIND_LABEL[kind].toLowerCase()}`}
                onClick={() => props.onAddNode(kind)}
              >
                {KIND_LABEL[kind]}
              </Button>
            ))}
          </div>
        </div>
        <NodeList
          empty="No suggestions waiting for review."
          nodes={groups.provisional}
          onAdopt={props.onAdopt}
          onReject={props.onReject}
          onSelect={props.onSelect}
        />
      </section>

      {props.context.nodes.length > 1 ? (
        <CrokiCanvasRelationships names={names} {...props} />
      ) : null}

      {groups.retired.length > 0 ? (
        <details className="group">
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
              {KIND_LABEL[node.kind]}
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
              title="Reject suggestion"
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
