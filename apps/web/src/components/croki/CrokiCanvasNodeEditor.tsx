import {
  CROKI_CONTEXT_LIMITS,
  CROKI_NODE_KINDS,
  CROKI_NODE_STATUSES,
  type CrokiContextNode,
  type CrokiContextReference,
  type CrokiNodeKind,
  type CrokiNodeStatus,
} from "@t3tools/shared/crokiContext";
import { ArrowLeft, Trash2 } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { CrokiCanvasReferences } from "./CrokiCanvasReferences";
import type { CrokiCanvasModelError } from "./crokiCanvasModel";

const KIND_LABEL: Record<CrokiNodeKind, string> = {
  intent: "Intent",
  decision: "Decision",
  evidence: "Evidence",
  work: "Work",
};

interface CrokiCanvasNodeEditorProps {
  readonly node: CrokiContextNode;
  readonly onBack: () => void;
  readonly onAddReference: (reference: CrokiContextReference) => CrokiCanvasModelError | null;
  readonly onDelete: (id: string) => void;
  readonly onOpenReference?: (reference: CrokiContextReference) => void;
  readonly onRemoveReference: (reference: CrokiContextReference) => void;
  readonly onUpdate: (
    id: string,
    patch: Partial<Pick<CrokiContextNode, "title" | "body" | "kind" | "status">>,
  ) => void;
}

export function CrokiCanvasNodeEditor(props: CrokiCanvasNodeEditorProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const errorId = useId();
  const titleInvalid =
    !props.node.title.trim() || props.node.title.length > CROKI_CONTEXT_LIMITS.nodeTitleChars;
  const bodyInvalid = props.node.body.length > CROKI_CONTEXT_LIMITS.nodeBodyChars;

  return (
    <article
      aria-label={
        props.node.title.trim() ? `Edit ${props.node.title}` : "Edit untitled Canvas item"
      }
      className="space-y-4"
    >
      <div className="flex items-center gap-2">
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Back to Canvas overview"
          onClick={props.onBack}
        >
          <ArrowLeft className="size-4" aria-hidden />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
            Edit item
          </p>
          <h3 className="truncate text-sm font-semibold">{props.node.title}</h3>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">Kind</span>
          <select
            aria-label="Kind"
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
            value={props.node.kind}
            onChange={(event) =>
              props.onUpdate(props.node.id, {
                kind: event.target.value as CrokiNodeKind,
              })
            }
          >
            {CROKI_NODE_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {KIND_LABEL[kind]}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs text-muted-foreground">Status</span>
          <select
            aria-label="Status"
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
            value={props.node.status}
            onChange={(event) =>
              props.onUpdate(props.node.id, {
                status: event.target.value as CrokiNodeStatus,
              })
            }
          >
            {CROKI_NODE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block space-y-1">
        <span className="text-xs text-muted-foreground">Title</span>
        <Input
          aria-invalid={titleInvalid}
          {...(titleInvalid ? { "aria-describedby": `${errorId}-title` } : {})}
          value={props.node.title}
          onChange={(event) => props.onUpdate(props.node.id, { title: event.target.value })}
        />
        {titleInvalid ? (
          <span id={`${errorId}-title`} role="alert" className="block text-xs text-destructive">
            Enter a title under {CROKI_CONTEXT_LIMITS.nodeTitleChars} characters.
          </span>
        ) : null}
      </label>

      <label className="block space-y-1">
        <span className="flex justify-between text-xs text-muted-foreground">
          <span>Details</span>
          <span>
            {props.node.body.length}/{CROKI_CONTEXT_LIMITS.nodeBodyChars}
          </span>
        </span>
        <Textarea
          aria-invalid={bodyInvalid}
          {...(bodyInvalid ? { "aria-describedby": `${errorId}-body` } : {})}
          className="min-h-44 resize-y"
          value={props.node.body}
          placeholder="Why this matters, what changed, or where the evidence lives…"
          onChange={(event) => props.onUpdate(props.node.id, { body: event.target.value })}
        />
        {bodyInvalid ? (
          <span id={`${errorId}-body`} role="alert" className="block text-xs text-destructive">
            Details exceed the Canvas limit.
          </span>
        ) : null}
      </label>

      <CrokiCanvasReferences
        references={props.node.references ?? []}
        onAdd={props.onAddReference}
        onRemove={props.onRemoveReference}
        {...(props.onOpenReference ? { onOpenReference: props.onOpenReference } : {})}
      />

      {confirmDelete ? (
        <div role="alert" className="flex items-center gap-2 border-y border-destructive/40 py-2">
          <p className="min-w-0 flex-1 text-xs">Delete this item and its relationships?</p>
          <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
            Cancel
          </Button>
          <Button size="sm" variant="destructive" onClick={() => props.onDelete(props.node.id)}>
            Delete
          </Button>
        </div>
      ) : (
        <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(true)}>
          <Trash2 className="size-3.5" aria-hidden />
          Delete item
        </Button>
      )}
    </article>
  );
}
