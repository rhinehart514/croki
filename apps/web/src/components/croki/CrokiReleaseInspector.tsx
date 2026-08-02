import type { CrokiContextReference } from "@croki/shared/crokiContext";
import {
  CROKI_RELEASE_ITEM_KINDS,
  CROKI_RELEASE_ITEM_STATUSES,
  CROKI_RELEASE_LIMITS,
  type CrokiReleaseCriterion,
  type CrokiReleaseItem,
  type CrokiReleaseItemKind,
  type CrokiReleaseItemStatus,
  type CrokiReleaseSourceThread,
} from "@croki/shared/crokiReleaseCandidate";
import { ArrowRight, Link2, Trash2, Unlink, X } from "lucide-react";
import { useState } from "react";

import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { ScrollArea } from "../ui/scroll-area";
import { Textarea } from "../ui/textarea";
import type { CrokiCanvasModelError } from "./crokiCanvasModel";
import { CrokiReleaseCriteriaEditor } from "./CrokiReleaseCriteriaEditor";
import { canVerifyCrokiReleaseItem } from "./crokiReleaseModel";

const STATUS_LABEL: Readonly<Record<CrokiReleaseItemStatus, string>> = {
  proposed: "Proposed",
  working: "Working",
  candidate: "Candidate",
  blocked: "Blocked",
  verified: "Verified",
  deferred: "Deferred",
};

export function CrokiReleaseInspector(props: {
  readonly currentThread?: CrokiReleaseSourceThread | null;
  readonly item: CrokiReleaseItem;
  readonly onAddCriterion: () => void;
  readonly onAddCriterionReference: (
    criterionId: string,
    reference: CrokiContextReference,
  ) => CrokiCanvasModelError | null;
  readonly onBack: () => void;
  readonly onDelete: () => void;
  readonly onDeleteCriterion: (criterionId: string) => void;
  readonly onLinkCurrentThread: () => void;
  readonly onOpenReference?: (reference: CrokiContextReference) => void;
  readonly onOpenThread?: (threadId: string) => void;
  readonly onRemoveCriterionReference: (
    criterionId: string,
    reference: CrokiContextReference,
  ) => void;
  readonly onUnlinkThread: (threadId: string) => void;
  readonly onUpdate: (
    patch: Partial<Pick<CrokiReleaseItem, "title" | "kind" | "status" | "outcome">>,
  ) => void;
  readonly onUpdateCriterion: (
    criterionId: string,
    patch: Partial<Pick<CrokiReleaseCriterion, "text" | "status">>,
  ) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const currentThreadLinked = Boolean(
    props.currentThread &&
    props.item.sourceThreads.some((thread) => thread.id === props.currentThread?.id),
  );
  const canVerify = canVerifyCrokiReleaseItem(props.item);

  return (
    <aside
      className="relative z-20 h-full w-[min(420px,48%)] min-w-80 shrink-0 border-l border-white/15 bg-black"
      aria-label="Release item inspector"
    >
      <ScrollArea className="h-full">
        <div className="space-y-6 p-5 pb-12">
          <header className="flex items-start gap-3 border-b border-white/10 pb-4">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500">
                Release item
              </p>
              <p className="mt-1 text-xs text-zinc-600">{props.item.id}</p>
            </div>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Close inspector"
              onClick={props.onBack}
            >
              <X className="size-4" aria-hidden />
            </Button>
          </header>

          <label className="block space-y-1">
            <span className="text-[10px] uppercase tracking-[0.1em] text-zinc-500">Title</span>
            <Input
              className="border-white/15 bg-black text-sm"
              maxLength={CROKI_RELEASE_LIMITS.itemTitleChars}
              value={props.item.title}
              onChange={(event) => props.onUpdate({ title: event.target.value })}
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="text-[10px] uppercase tracking-[0.1em] text-zinc-500">Kind</span>
              <select
                aria-label="Release item kind"
                className="h-9 w-full border border-white/15 bg-black px-2 text-xs text-zinc-300"
                value={props.item.kind}
                onChange={(event) =>
                  props.onUpdate({ kind: event.target.value as CrokiReleaseItemKind })
                }
              >
                {CROKI_RELEASE_ITEM_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {kind}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-[10px] uppercase tracking-[0.1em] text-zinc-500">State</span>
              <select
                aria-label="Release item state"
                className="h-9 w-full border border-white/15 bg-black px-2 text-xs text-zinc-300"
                value={props.item.status}
                onChange={(event) =>
                  props.onUpdate({ status: event.target.value as CrokiReleaseItemStatus })
                }
              >
                {CROKI_RELEASE_ITEM_STATUSES.map((status) => (
                  <option
                    key={status}
                    value={status}
                    disabled={status === "verified" && !canVerify}
                  >
                    {STATUS_LABEL[status]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {!canVerify && props.item.status !== "verified" ? (
            <p className="border-l border-white/10 px-3 text-[11px] leading-4 text-zinc-600">
              Verified unlocks when every acceptance criterion passes.
            </p>
          ) : null}

          <label className="block space-y-1">
            <span className="text-[10px] uppercase tracking-[0.1em] text-zinc-500">Outcome</span>
            <Textarea
              className="min-h-24 resize-y border-white/15 bg-black text-xs leading-5"
              maxLength={CROKI_RELEASE_LIMITS.itemOutcomeChars}
              placeholder="What becomes true for the user when this ships?"
              value={props.item.outcome}
              onChange={(event) => props.onUpdate({ outcome: event.target.value })}
            />
          </label>

          <section className="space-y-3" aria-label="Source Threads">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500">
                  Source Threads
                </p>
                <p className="mt-1 text-[11px] leading-4 text-zinc-600">
                  Work remains in the native Thread.
                </p>
              </div>
              {props.currentThread && !currentThreadLinked ? (
                <Button size="sm" variant="ghost" onClick={props.onLinkCurrentThread}>
                  <Link2 className="size-3.5" aria-hidden />
                  Link current
                </Button>
              ) : null}
            </div>
            {props.item.sourceThreads.length > 0 ? (
              <ul className="divide-y divide-white/10 border-y border-white/10">
                {props.item.sourceThreads.map((thread) => (
                  <li key={thread.id} className="flex min-h-10 items-center gap-1">
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-2 px-2 text-left text-xs text-zinc-300 hover:text-white"
                      disabled={!props.onOpenThread}
                      onClick={() => props.onOpenThread?.(thread.id)}
                    >
                      <span className="truncate">{thread.title}</span>
                      {props.onOpenThread ? (
                        <ArrowRight className="size-3 shrink-0 text-zinc-600" aria-hidden />
                      ) : null}
                    </button>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      aria-label={`Unlink ${thread.title}`}
                      onClick={() => props.onUnlinkThread(thread.id)}
                    >
                      <Unlink className="size-3" aria-hidden />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="border-l border-white/10 px-3 py-1 text-xs text-zinc-600">
                No Thread linked yet.
              </p>
            )}
          </section>

          <CrokiReleaseCriteriaEditor
            criteria={props.item.acceptanceCriteria}
            onAdd={props.onAddCriterion}
            onAddReference={props.onAddCriterionReference}
            onDelete={props.onDeleteCriterion}
            onRemoveReference={props.onRemoveCriterionReference}
            onUpdate={props.onUpdateCriterion}
            {...(props.onOpenReference ? { onOpenReference: props.onOpenReference } : {})}
          />

          <div className="border-t border-white/10 pt-4">
            {confirmDelete ? (
              <div className="flex items-center gap-2" role="alert">
                <p className="min-w-0 flex-1 text-xs text-zinc-400">Delete this release item?</p>
                <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
                  Cancel
                </Button>
                <Button size="sm" variant="destructive" onClick={props.onDelete}>
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
        </div>
      </ScrollArea>
    </aside>
  );
}
