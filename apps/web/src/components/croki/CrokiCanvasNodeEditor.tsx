import {
  CROKI_CONTEXT_LIMITS,
  CROKI_NODE_DOMAINS,
  CROKI_NODE_KINDS,
  type CrokiContextNode,
  type CrokiContextReference,
  type CrokiNodeDomain,
  type CrokiNodeKind,
} from "@croki/shared/crokiContext";
import { Archive, Check, Pencil, Trash2, X } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { CrokiCanvasReferences } from "./CrokiCanvasReferences";
import { crokiNodeDomain, crokiNodeKindLabel } from "./crokiCanvasLanguage";
import type { CrokiCanvasModelError } from "./crokiCanvasModel";

const DOMAIN_LABEL: Record<CrokiNodeDomain, string> = {
  product: "Product",
  gtm: "GTM",
  workflow: "Workflow",
  shared: "Shared",
};

interface CrokiCanvasNodeEditorProps {
  readonly node: CrokiContextNode;
  readonly onAdopt: (id: string) => void;
  readonly onBack: () => void;
  readonly onAddReference: (reference: CrokiContextReference) => CrokiCanvasModelError | null;
  readonly onDelete: (id: string) => void;
  readonly onOpenReference?: (reference: CrokiContextReference) => void;
  readonly onDecline: (id: string) => void;
  readonly onRemoveReference: (reference: CrokiContextReference) => void;
  readonly onRetire: (id: string) => void;
  readonly onUpdate: (
    id: string,
    patch: Partial<Pick<CrokiContextNode, "title" | "body" | "kind" | "status" | "domain">>,
  ) => void;
}

export function CrokiCanvasNodeEditor(props: CrokiCanvasNodeEditorProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmRetire, setConfirmRetire] = useState(false);
  const [editing, setEditing] = useState(false);
  const errorId = useId();
  const titleInvalid =
    !props.node.title.trim() || props.node.title.length > CROKI_CONTEXT_LIMITS.nodeTitleChars;
  const bodyInvalid = props.node.body.length > CROKI_CONTEXT_LIMITS.nodeBodyChars;
  const domain = crokiNodeDomain(props.node);

  return (
    <article
      aria-label={
        props.node.title.trim() ? `Edit ${props.node.title}` : "Edit untitled Canvas item"
      }
      className="space-y-5"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-medium tracking-[0.12em] text-zinc-500 uppercase">
            {props.node.status === "provisional" ? "Judgment required" : "Current understanding"}
          </p>
          <h3 className="mt-2 text-xl leading-7 font-semibold text-white">{props.node.title}</h3>
        </div>
        <Button size="icon-sm" variant="ghost" aria-label="Close inspector" onClick={props.onBack}>
          <X className="size-4" aria-hidden />
        </Button>
      </div>

      <div className="flex items-center gap-2 border-y border-white/10 py-3 text-xs">
        <span className="font-medium text-white">
          {props.node.status === "current"
            ? "Founder-approved"
            : props.node.status === "provisional"
              ? "Proposed"
              : "Retired"}
        </span>
        <span className="text-zinc-500">
          {" "}
          · origin {props.node.origin ?? (props.node.status === "current" ? "founder" : "agent")}
        </span>
      </div>

      {props.node.body.trim() ? (
        <p className="whitespace-pre-wrap text-[13px] leading-5 text-zinc-300">{props.node.body}</p>
      ) : (
        <p className="text-[13px] leading-5 text-zinc-500">No supporting context recorded.</p>
      )}

      {props.node.status === "provisional" && !editing ? (
        <section className="space-y-3 border-y border-white/15 py-4" aria-label="Founder judgment">
          <p className="text-xs leading-5 text-zinc-400">
            Croki proposed this interpretation. Its evidence remains attached whichever judgment you
            make.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" onClick={() => props.onDecline(props.node.id)}>
              Decline
            </Button>
            <Button onClick={() => props.onAdopt(props.node.id)}>
              <Check className="size-4" aria-hidden />
              Accept
            </Button>
          </div>
        </section>
      ) : null}

      <CrokiCanvasReferences
        editable={editing}
        references={props.node.references ?? []}
        onAdd={props.onAddReference}
        onRemove={props.onRemoveReference}
        {...(props.onOpenReference ? { onOpenReference: props.onOpenReference } : {})}
      />

      {editing ? (
        <div className="space-y-4 border-t border-white/10 pt-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-white">Advanced context edit</p>
              <p className="text-[11px] text-zinc-500">Changes stay local until Canvas is saved.</p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Done
            </Button>
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
                    {crokiNodeKindLabel(kind, domain)}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">Area</span>
              <select
                aria-label="Area"
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
                value={domain}
                onChange={(event) =>
                  props.onUpdate(props.node.id, {
                    domain: event.target.value as CrokiNodeDomain,
                  })
                }
              >
                {CROKI_NODE_DOMAINS.map((nodeDomain) => (
                  <option key={nodeDomain} value={nodeDomain}>
                    {DOMAIN_LABEL[nodeDomain]}
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

          {confirmDelete ? (
            <div
              role="alert"
              className="flex items-center gap-2 border-y border-destructive/40 py-2"
            >
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
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 border-t border-white/10 pt-4">
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            <Pencil className="size-3.5" aria-hidden />
            Advanced edit
          </Button>
          {props.node.status === "current" ? (
            confirmRetire ? (
              <div role="alert" className="flex flex-1 items-center justify-end gap-2">
                <span className="text-xs text-zinc-400">Archive this understanding?</span>
                <Button size="sm" variant="ghost" onClick={() => setConfirmRetire(false)}>
                  Cancel
                </Button>
                <Button size="sm" variant="outline" onClick={() => props.onRetire(props.node.id)}>
                  Archive
                </Button>
              </div>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setConfirmRetire(true)}>
                <Archive className="size-3.5" aria-hidden />
                Archive
              </Button>
            )
          ) : null}
        </div>
      )}
    </article>
  );
}
