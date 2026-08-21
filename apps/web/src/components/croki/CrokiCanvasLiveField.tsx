import { ChevronDown, Files } from "lucide-react";
import { useMemo } from "react";

import { CrokiCanvasLiveObjectCard } from "./CrokiCanvasLiveObjects";
import type { CrokiCanvasLiveObject, CrokiCanvasLiveScene } from "./crokiCanvasLiveScene";

interface CrokiCanvasLiveFieldProps {
  readonly scene: CrokiCanvasLiveScene;
  readonly focusMode: "all" | "attention";
  readonly selectedIds: readonly string[];
  readonly onClearSelection: () => void;
  readonly onAddress: (object: CrokiCanvasLiveObject) => void;
  readonly onOpen: (object: CrokiCanvasLiveObject) => void;
  readonly onSelect: (object: CrokiCanvasLiveObject) => void;
}

/** A readable brief of the agent's current understanding, not a diagram editor. */
export function CrokiCanvasLiveField(props: CrokiCanvasLiveFieldProps) {
  const visibleObjects = useMemo(
    () => visibleSceneObjects(props.scene, props.focusMode),
    [props.focusMode, props.scene],
  );
  const groups = useMemo(() => groupObjects(visibleObjects), [visibleObjects]);
  const selectedIds = useMemo(() => new Set(props.selectedIds), [props.selectedIds]);
  const renderObject = (
    object: CrokiCanvasLiveObject,
    prominence: "hero" | "normal" | "compact",
  ) => (
    <CrokiCanvasLiveObjectCard
      key={object.id}
      object={object}
      prominence={prominence}
      selected={selectedIds.has(object.id)}
      onAddress={props.onAddress}
      onOpen={props.onOpen}
      onSelect={props.onSelect}
    />
  );

  if (visibleObjects.length === 0) {
    return (
      <div className="flex min-h-72 flex-1 items-center justify-center bg-black p-8 text-center">
        <div className="max-w-sm">
          <p className="text-sm font-medium text-zinc-200">Nothing to summarize yet</p>
          <p className="mt-2 text-xs leading-5 text-zinc-500">
            Start the Thread. Canvas will keep the outcome, conclusions, and anything that needs
            your judgment here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-0 flex-1 overflow-y-auto bg-black"
      data-canvas-focus={props.focusMode}
      aria-label="Live Canvas brief"
      onClick={(event) => {
        if (event.target === event.currentTarget) props.onClearSelection();
      }}
    >
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-5 py-6 sm:px-8 sm:py-8">
        {groups.judgments.length > 0 ? (
          <section aria-labelledby="canvas-judgment-heading">
            <SectionLabel id="canvas-judgment-heading" tone="judgment">
              Your judgment
            </SectionLabel>
            <div className="grid gap-3 md:grid-cols-2">
              {groups.judgments.map((object, index) =>
                renderObject(object, index === 0 ? "hero" : "normal"),
              )}
            </div>
          </section>
        ) : null}

        {groups.outcome ? (
          <section aria-labelledby="canvas-outcome-heading">
            <SectionLabel id="canvas-outcome-heading">Current outcome</SectionLabel>
            {renderObject(groups.outcome, "hero")}
          </section>
        ) : (
          <section aria-labelledby="canvas-outcome-heading">
            <SectionLabel id="canvas-outcome-heading">Product outcome</SectionLabel>
            <div className="border border-dashed border-white/15 px-5 py-5">
              <p className="text-sm font-medium text-zinc-200">No outcome established yet</p>
              <p className="mt-1.5 max-w-2xl text-xs leading-5 text-zinc-500">
                Canvas has observed work, but no Thread has produced a durable product outcome.
              </p>
            </div>
          </section>
        )}

        {groups.conclusions.length > 0 ? (
          <section aria-labelledby="canvas-conclusions-heading">
            <SectionLabel id="canvas-conclusions-heading">What matters now</SectionLabel>
            <div className="grid gap-3 md:grid-cols-2">
              {groups.conclusions.map((object) => renderObject(object, "normal"))}
            </div>
          </section>
        ) : null}

        {groups.workstreams.length === 1 ? (
          <SourceThreadProvenance
            object={groups.workstreams[0]!}
            onOpen={props.onOpen}
            onSelect={props.onSelect}
          />
        ) : groups.workstreams.length > 1 ? (
          <section aria-labelledby="canvas-workstreams-heading">
            <SectionLabel id="canvas-workstreams-heading">Workstreams</SectionLabel>
            <div className="grid gap-3 md:grid-cols-2">
              {groups.workstreams.map((object) => renderObject(object, "compact"))}
            </div>
          </section>
        ) : null}

        {groups.evidence.length > 0 ? (
          <details className="group border-t border-white/10 pt-4">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-xs text-zinc-400 outline-none hover:text-white focus-visible:ring-1 focus-visible:ring-white [&::-webkit-details-marker]:hidden">
              <Files className="size-3.5" aria-hidden />
              <span>{groups.evidence.length} sources and supporting observations</span>
              <ChevronDown
                className="ml-auto size-3.5 transition-transform group-open:rotate-180"
                aria-hidden
              />
            </summary>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {groups.evidence.map((object) => renderObject(object, "compact"))}
            </div>
          </details>
        ) : null}
      </div>
    </div>
  );
}

function SourceThreadProvenance(props: {
  readonly object: CrokiCanvasLiveObject;
  readonly onOpen: (object: CrokiCanvasLiveObject) => void;
  readonly onSelect: (object: CrokiCanvasLiveObject) => void;
}) {
  return (
    <div
      className="flex min-w-0 items-center gap-2 border-t border-white/10 pt-3 text-[11px]"
      data-canvas-provenance="source-thread"
    >
      <span className="shrink-0 text-[9px] uppercase tracking-[0.12em] text-zinc-600">
        Source Thread
      </span>
      <button
        type="button"
        className="min-w-0 truncate text-left text-zinc-300 outline-none hover:text-white focus-visible:ring-1 focus-visible:ring-white"
        onClick={() => props.onSelect(props.object)}
      >
        {props.object.title}
      </button>
      {props.object.body.trim() ? (
        <span className="min-w-0 truncate text-zinc-600">{props.object.body}</span>
      ) : null}
      {props.object.sourceThreadId || props.object.perceptionSourceUri || props.object.reference ? (
        <button
          type="button"
          className="ml-auto shrink-0 text-zinc-500 outline-none hover:text-white focus-visible:ring-1 focus-visible:ring-white"
          onClick={() => props.onOpen(props.object)}
        >
          Open
        </button>
      ) : null}
    </div>
  );
}

function SectionLabel(props: {
  readonly children: string;
  readonly id: string;
  readonly tone?: "default" | "judgment";
}) {
  return (
    <h2
      id={props.id}
      className={`mb-2.5 text-xs font-medium ${
        props.tone === "judgment" ? "text-amber-300" : "text-zinc-200"
      }`}
    >
      {props.children}
    </h2>
  );
}

function visibleSceneObjects(scene: CrokiCanvasLiveScene, focusMode: "all" | "attention") {
  if (focusMode === "all" || scene.attentionIds.length === 0) return scene.objects;
  const ids = new Set(["attention:stream", ...scene.attentionIds]);
  for (const edge of scene.edges) {
    if (ids.has(edge.from)) ids.add(edge.to);
    if (ids.has(edge.to)) ids.add(edge.from);
  }
  return scene.objects.filter((object) => ids.has(object.id));
}

function groupObjects(objects: readonly CrokiCanvasLiveObject[]) {
  const outcome =
    objects.find((object) => object.source === "outcome") ??
    objects.find((object) => object.source === "attention" || object.source === "release") ??
    null;
  const remainder = objects.filter((object) => object !== outcome);
  const judgments = remainder.filter(isJudgment).sort(compareJudgments).slice(0, 2);
  const workstreams = remainder.filter((object) => object.source === "agent").slice(0, 4);
  const conclusionCandidates = remainder.filter(
    (object) => !judgments.includes(object) && !workstreams.includes(object) && !isEvidence(object),
  );
  const conclusions = conclusionCandidates.slice(0, 3);
  const promoted = new Set([outcome, ...judgments, ...conclusions, ...workstreams].filter(Boolean));
  return {
    outcome,
    judgments,
    conclusions,
    workstreams,
    evidence: remainder.filter((object) => !promoted.has(object)),
  };
}

function isJudgment(object: CrokiCanvasLiveObject): boolean {
  return (
    object.source === "attention" ||
    object.kind === "decision" ||
    object.status === "provisional" ||
    object.status === "blocked" ||
    object.status === "error" ||
    object.status === "awaiting-approval" ||
    object.authority?.toLowerCase().includes("judgment") === true ||
    object.perceptionObject?.affordances.some((affordance) => affordance.requiresApproval) === true
  );
}

function compareJudgments(left: CrokiCanvasLiveObject, right: CrokiCanvasLiveObject): number {
  return (
    judgmentPriority(left) - judgmentPriority(right) ||
    (right.revision ?? 0) - (left.revision ?? 0) ||
    (right.updatedAt ?? "").localeCompare(left.updatedAt ?? "")
  );
}

function judgmentPriority(object: CrokiCanvasLiveObject): number {
  if (object.status === "blocked" || object.status === "error") return 0;
  if (object.status === "awaiting-approval") return 1;
  if (object.status === "provisional") return 2;
  if (object.perceptionObject?.affordances.some((affordance) => affordance.requiresApproval)) {
    return 3;
  }
  if (object.kind === "decision") return 4;
  return 5;
}

function isEvidence(object: CrokiCanvasLiveObject): boolean {
  return (
    object.source === "reference" ||
    object.kind === "evidence" ||
    object.kind === "source" ||
    object.status === "prior" ||
    object.status === "retired"
  );
}
