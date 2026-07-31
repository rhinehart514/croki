import type { CrokiContextNode } from "@t3tools/shared/crokiContext";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { ArrowRight, FileCode2, Link2, Quote } from "lucide-react";
import type { ReactNode } from "react";

import { crokiNodeDomain, crokiNodeKindLabel } from "./crokiCanvasLanguage";
import { crokiNodeEpistemicLabel } from "./crokiCanvasProjection";
import {
  type CrokiCanvasFileReferenceItem,
  type CrokiCanvasPlanStepItem,
  type CrokiCanvasSemanticItem,
  type CrokiCanvasUrlReferenceItem,
} from "./crokiCanvasItems";

interface CrokiCanvasObjectDataBase extends Record<string, unknown> {
  readonly authorityLabel?: string;
  readonly connectable: boolean;
  readonly connected: boolean;
  readonly focus: boolean;
  readonly onSelect: (id: string) => void;
  readonly ordinal: number;
  readonly orientation: "horizontal" | "vertical";
}

type CrokiCanvasObjectData<T> = CrokiCanvasObjectDataBase & { readonly item: T };

type CrokiCanvasSemanticObject = Node<
  CrokiCanvasObjectData<CrokiCanvasSemanticItem>,
  "intent-object" | "decision-object" | "evidence-object" | "work-object"
>;
type CrokiCanvasPlanStepObject = Node<
  CrokiCanvasObjectData<CrokiCanvasPlanStepItem>,
  "plan-step-object"
>;
type CrokiCanvasFileReferenceObject = Node<
  CrokiCanvasObjectData<CrokiCanvasFileReferenceItem>,
  "file-reference-object"
>;
type CrokiCanvasUrlReferenceObject = Node<
  CrokiCanvasObjectData<CrokiCanvasUrlReferenceItem>,
  "url-reference-object"
>;
export type CrokiCanvasObject =
  | CrokiCanvasSemanticObject
  | CrokiCanvasPlanStepObject
  | CrokiCanvasFileReferenceObject
  | CrokiCanvasUrlReferenceObject;

export const crokiCanvasObjectTypes = {
  "intent-object": IntentObject,
  "decision-object": DecisionObject,
  "evidence-object": EvidenceObject,
  "work-object": WorkObject,
  "plan-step-object": PlanStepObject,
  "file-reference-object": FileReferenceObject,
  "url-reference-object": UrlReferenceObject,
};

function IntentObject({ data, selected }: NodeProps<CrokiCanvasSemanticObject>) {
  const { node } = data.item;
  return (
    <ObjectShell data={data} selected={selected}>
      <div className="relative h-full pl-7">
        <span className="absolute top-2 left-0 size-3 rounded-full border border-white bg-black" />
        <span className="absolute top-[13px] left-3 h-px w-10 bg-zinc-700" />
        <ObjectMeta node={node} authorityLabel={data.authorityLabel} />
        <h3 className="mt-3 text-[15px] leading-5 font-semibold text-white">{node.title}</h3>
        <ObjectBody node={node} />
      </div>
    </ObjectShell>
  );
}

function DecisionObject({ data, selected }: NodeProps<CrokiCanvasSemanticObject>) {
  const { node } = data.item;
  return (
    <ObjectShell data={data} selected={selected}>
      <div className="relative h-full px-8 py-5">
        <span className="absolute top-0 left-0 h-10 w-px bg-white" />
        <span className="absolute top-0 left-0 h-px w-10 bg-white" />
        <span className="absolute right-0 bottom-0 h-10 w-px bg-white" />
        <span className="absolute right-0 bottom-0 h-px w-10 bg-white" />
        <ObjectMeta node={node} authorityLabel={data.authorityLabel} />
        <h3 className="mt-4 max-w-[300px] text-[20px] leading-6 font-semibold tracking-[-0.015em] text-white">
          {node.title}
        </h3>
        <ObjectBody node={node} />
        <span className="absolute right-5 bottom-4 flex items-center gap-1.5 text-[10px] text-zinc-500">
          Inspect
          <ArrowRight className="size-3" aria-hidden />
        </span>
      </div>
    </ObjectShell>
  );
}

function EvidenceObject({ data, selected }: NodeProps<CrokiCanvasSemanticObject>) {
  const { node } = data.item;
  return (
    <ObjectShell data={data} selected={selected}>
      <div className="relative h-full border-l border-dashed border-zinc-600 pl-8">
        <Quote className="absolute top-0 left-2 size-3.5 text-zinc-600" aria-hidden />
        <ObjectMeta node={node} authorityLabel={data.authorityLabel} />
        <h3 className="mt-3 text-[14px] leading-5 font-medium text-zinc-100">{node.title}</h3>
        <ObjectBody node={node} />
        {(node.references?.length ?? 0) > 0 ? (
          <p className="mt-2 text-[10px] text-zinc-600">
            {node.references?.length} {node.references?.length === 1 ? "source" : "sources"}
          </p>
        ) : null}
      </div>
    </ObjectShell>
  );
}

function WorkObject({ data, selected }: NodeProps<CrokiCanvasSemanticObject>) {
  const { node } = data.item;
  return (
    <ObjectShell data={data} selected={selected}>
      <div className="flex h-full items-start gap-4">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-zinc-600 font-mono text-[11px] text-zinc-400">
          {String(data.ordinal).padStart(2, "0")}
        </span>
        <div className="min-w-0 flex-1 border-t border-zinc-600 pt-3">
          <ObjectMeta node={node} authorityLabel={data.authorityLabel} />
          <h3 className="mt-2 text-[14px] leading-5 font-semibold text-white">{node.title}</h3>
          <ObjectBody node={node} />
        </div>
      </div>
    </ObjectShell>
  );
}

function PlanStepObject({ data, selected }: NodeProps<CrokiCanvasPlanStepObject>) {
  const { step } = data.item;
  const statusLabel =
    step.status === "inProgress"
      ? "In progress"
      : step.status === "completed"
        ? "Completed"
        : "Pending";
  return (
    <ObjectShell data={data} selected={selected}>
      <div className="flex h-full items-start gap-4">
        <span
          className={`mt-1 size-3 shrink-0 rounded-full border transition-colors duration-200 motion-reduce:transition-none ${
            step.status === "completed"
              ? "border-white bg-white"
              : step.status === "inProgress"
                ? "border-sky-400 bg-black shadow-[0_0_0_3px_rgba(56,189,248,0.12)]"
                : "border-zinc-600 bg-black"
          }`}
        />
        <div className="min-w-0 flex-1 border-t border-zinc-600 pt-3">
          <p className="text-[11px] font-medium text-zinc-400">
            Thread plan <span className="px-1 text-zinc-600">·</span> {statusLabel}
          </p>
          <h3 className="mt-2 text-[14px] leading-5 font-semibold text-white">{data.item.title}</h3>
        </div>
      </div>
    </ObjectShell>
  );
}

function FileReferenceObject({ data, selected }: NodeProps<CrokiCanvasFileReferenceObject>) {
  const reference = data.item.reference;
  return (
    <ObjectShell data={data} selected={selected}>
      <div className="flex h-full items-start gap-3 border-t border-zinc-700 pt-3">
        <FileCode2 className="mt-0.5 size-4 shrink-0 text-zinc-500" aria-hidden />
        <div className="min-w-0">
          <p className="text-[10px] font-medium tracking-[0.08em] text-zinc-500 uppercase">
            Workspace file
          </p>
          <h3 className="mt-1.5 truncate font-mono text-[12px] leading-5 text-zinc-100">
            {data.item.title}
          </h3>
          {reference.line !== undefined ? (
            <p className="mt-1 font-mono text-[10px] text-zinc-600">Line {reference.line}</p>
          ) : null}
        </div>
      </div>
    </ObjectShell>
  );
}

function UrlReferenceObject({ data, selected }: NodeProps<CrokiCanvasUrlReferenceObject>) {
  return (
    <ObjectShell data={data} selected={selected}>
      <div className="flex h-full items-start gap-3 border-t border-zinc-700 pt-3">
        <Link2 className="mt-0.5 size-4 shrink-0 text-zinc-500" aria-hidden />
        <div className="min-w-0">
          <p className="text-[10px] font-medium tracking-[0.08em] text-zinc-500 uppercase">
            External source
          </p>
          <h3 className="mt-1.5 truncate text-[12px] leading-5 text-zinc-100">{data.item.title}</h3>
        </div>
      </div>
    </ObjectShell>
  );
}

function ObjectShell(props: {
  readonly children: ReactNode;
  readonly data: CrokiCanvasObject["data"];
  readonly selected: boolean;
}) {
  const { item } = props.data;
  const retired = item.kind === "semantic" && item.node.status === "retired";
  const faded = retired || !props.data.connected;
  return (
    <article
      className={`croki-canvas-object-enter group relative h-full w-full bg-black transition-opacity duration-150 motion-reduce:transition-none ${
        faded ? "opacity-40" : "opacity-100"
      }`}
    >
      {props.data.connectable ? <ObjectHandles orientation={props.data.orientation} /> : null}
      {props.selected ? <RegistrationCorners /> : null}
      <button
        type="button"
        aria-label={`${item.kind === "semantic" ? "Inspect" : "Open"} ${item.title}`}
        className="h-full w-full cursor-grab text-left outline-none active:cursor-grabbing"
        onClick={() => props.data.onSelect(item.id)}
      >
        {props.children}
      </button>
    </article>
  );
}

function ObjectHandles(props: { readonly orientation: "horizontal" | "vertical" }) {
  const horizontal = props.orientation === "horizontal";
  return (
    <>
      <Handle
        type="target"
        position={horizontal ? Position.Left : Position.Top}
        className="!h-6 !w-6 !rounded-none !border-0 !bg-transparent"
      />
      <Handle
        type="source"
        position={horizontal ? Position.Right : Position.Bottom}
        className="!h-8 !w-10 !rounded-none !border-0 !bg-transparent"
      />
      <span
        aria-hidden
        className={`pointer-events-none absolute z-10 flex items-center gap-1 text-[11px] text-zinc-300 opacity-0 transition-opacity group-hover:opacity-100 ${
          horizontal
            ? "top-1/2 -right-1 -translate-y-1/2 translate-x-full"
            : "-bottom-1 left-1/2 -translate-x-1/2 translate-y-full"
        }`}
      >
        <span className="h-px w-3 bg-zinc-400" />
        Relate
      </span>
    </>
  );
}

function RegistrationCorners() {
  const corner =
    "croki-canvas-registration-enter pointer-events-none absolute z-20 size-3 border-sky-400";
  return (
    <>
      <span className={`${corner} top-[-6px] left-[-6px] border-t border-l`} />
      <span className={`${corner} top-[-6px] right-[-6px] border-t border-r`} />
      <span className={`${corner} bottom-[-6px] left-[-6px] border-b border-l`} />
      <span className={`${corner} right-[-6px] bottom-[-6px] border-r border-b`} />
    </>
  );
}

function ObjectMeta(props: {
  readonly authorityLabel: string | undefined;
  readonly node: CrokiContextNode;
}) {
  const kind = crokiNodeKindLabel(props.node.kind, crokiNodeDomain(props.node));
  return (
    <div className="flex items-center text-[11px] font-medium text-zinc-400">
      <span className="text-zinc-200">{kind}</span>
      <span className="px-1.5 text-zinc-600">·</span>
      <span
        className={`transition-colors duration-150 motion-reduce:transition-none ${
          props.node.status === "provisional" ? "text-amber-300" : "text-zinc-400"
        }`}
      >
        {props.authorityLabel ?? crokiNodeEpistemicLabel(props.node)}
      </span>
    </div>
  );
}

function ObjectBody(props: { readonly node: CrokiContextNode }) {
  return props.node.body.trim() ? (
    <p className="mt-2 line-clamp-3 text-xs leading-[18px] text-zinc-300">{props.node.body}</p>
  ) : null;
}
