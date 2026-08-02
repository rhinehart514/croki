import {
  CROKI_CONTEXT_LIMITS,
  type CrokiContext,
  type CrokiContextEdge,
  type CrokiContextNode,
} from "@croki/shared/crokiContext";
import { Link2, Plus, Trash2 } from "lucide-react";

import { Button } from "../ui/button";
import { Input } from "../ui/input";

interface CrokiCanvasRelationshipsProps {
  readonly context: CrokiContext;
  readonly edgeFrom: string;
  readonly edgeRelation: string;
  readonly edgeTo: string;
  readonly names: ReadonlyMap<string, string>;
  readonly onAddEdge: () => void;
  readonly onDeleteEdge: (edge: CrokiContextEdge) => void;
  readonly onEdgeFromChange: (value: string) => void;
  readonly onEdgeRelationChange: (value: string) => void;
  readonly onEdgeToChange: (value: string) => void;
}

export function CrokiCanvasRelationships(props: CrokiCanvasRelationshipsProps) {
  const canAdd =
    Boolean(props.edgeFrom) &&
    Boolean(props.edgeTo) &&
    props.edgeFrom !== props.edgeTo &&
    Boolean(props.edgeRelation.trim());
  return (
    <section aria-label="Relationships">
      <div className="mb-2 flex items-center gap-2">
        <Link2 className="size-3.5 text-muted-foreground" aria-hidden />
        <h3 className="text-xs font-semibold tracking-wide uppercase">Relationships</h3>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_5rem_minmax(0,1fr)_auto] items-center gap-1">
        <NodeSelect
          label="Relationship source"
          nodes={props.context.nodes}
          value={props.edgeFrom}
          onChange={props.onEdgeFromChange}
        />
        <Input
          className="h-8 min-w-0 text-xs"
          aria-label="Relationship"
          maxLength={CROKI_CONTEXT_LIMITS.edgeRelationChars}
          value={props.edgeRelation}
          onChange={(event) => props.onEdgeRelationChange(event.target.value)}
        />
        <NodeSelect
          label="Relationship target"
          nodes={props.context.nodes}
          value={props.edgeTo}
          onChange={props.onEdgeToChange}
        />
        <Button
          size="icon-sm"
          variant="outline"
          aria-label="Add relationship"
          disabled={!canAdd}
          onClick={props.onAddEdge}
        >
          <Plus className="size-3.5" aria-hidden />
        </Button>
      </div>
      <ul className="mt-2 divide-y divide-border/60 border-y border-border/60">
        {props.context.edges.map((edge) => (
          <li
            key={`${edge.from}-${edge.relation}-${edge.to}`}
            className="flex min-h-9 items-center gap-2 text-xs"
          >
            <span className="min-w-0 flex-1 truncate">
              {props.names.get(edge.from)}
              <span className="px-1 text-muted-foreground">{edge.relation} →</span>
              {props.names.get(edge.to)}
            </span>
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label="Delete relationship"
              onClick={() => props.onDeleteEdge(edge)}
            >
              <Trash2 className="size-3" aria-hidden />
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function NodeSelect(props: {
  readonly label: string;
  readonly nodes: readonly CrokiContextNode[];
  readonly onChange: (value: string) => void;
  readonly value: string;
}) {
  return (
    <select
      aria-label={props.label}
      className="h-8 min-w-0 rounded-md border border-input bg-background px-2 text-xs"
      value={props.value}
      onChange={(event) => props.onChange(event.target.value)}
    >
      <option value="">Select…</option>
      {props.nodes.map((node) => (
        <option key={node.id} value={node.id}>
          {node.title}
        </option>
      ))}
    </select>
  );
}
