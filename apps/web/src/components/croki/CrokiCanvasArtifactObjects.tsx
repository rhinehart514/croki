import type { Node, NodeProps } from "@xyflow/react";
import { Quote } from "lucide-react";
import type { MouseEvent } from "react";

import type { CrokiCanvasArtifactNodeLike } from "./crokiCanvasArtifactTypes";
import type { CrokiCanvasArtifactRole } from "./crokiCanvasArtifactLayout";

export interface CrokiCanvasArtifactObjectData extends Record<string, unknown> {
  readonly node: CrokiCanvasArtifactNodeLike;
  readonly ordinal: number;
  readonly selected: boolean;
  readonly onSelect: (id: string) => void;
  readonly onSelectWithEvent: (id: string, event: MouseEvent<HTMLButtonElement>) => void;
}

export type CrokiCanvasArtifactObject = Node<CrokiCanvasArtifactObjectData, "artifact-object">;

export const crokiCanvasArtifactObjectTypes = {
  "artifact-object": ArtifactObject,
};

function ArtifactObject({ data }: NodeProps<CrokiCanvasArtifactObject>) {
  const { node } = data;
  return (
    <article
      data-canvas-role={node.role}
      className={`group relative h-full w-full bg-black text-left ${
        data.selected ? "text-white" : "text-zinc-100"
      }`}
    >
      {data.selected ? <RegistrationFrame /> : null}
      <button
        type="button"
        aria-label={`Inspect ${node.title}`}
        className="relative h-full w-full cursor-grab text-left outline-none active:cursor-grabbing"
        onClick={(event) => {
          // React Flow also supports marquee selection. This direct gesture is
          // what makes additive selection predictable on touchpads and mobile.
          data.onSelectWithEvent?.(node.id, event);
          event.stopPropagation();
        }}
      >
        <NodeContent node={node} ordinal={data.ordinal} />
      </button>
    </article>
  );
}

function NodeContent(props: {
  readonly node: CrokiCanvasArtifactNodeLike;
  readonly ordinal: number;
}) {
  const role = props.node.role;
  if (role === "question" || role === "focal") return <FocalNode node={props.node} />;
  if (role === "route") return <RouteNode node={props.node} />;
  if (role === "evidence") return <EvidenceNode node={props.node} />;
  if (role === "action") return <ActionNode node={props.node} ordinal={props.ordinal} />;
  return <WarningNode node={props.node} />;
}

function FocalNode(props: { readonly node: CrokiCanvasArtifactNodeLike }) {
  return (
    <div className="relative h-full px-8 py-6">
      <span className="absolute top-0 left-0 h-8 w-px bg-white" aria-hidden />
      <span className="absolute top-0 left-0 h-px w-8 bg-white" aria-hidden />
      <span className="absolute right-0 bottom-0 h-8 w-px bg-white" aria-hidden />
      <span className="absolute right-0 bottom-0 h-px w-8 bg-white" aria-hidden />
      <RoleLabel role={props.node.role} />
      <h3 className="mt-3 text-[19px] leading-6 font-semibold tracking-[-0.015em] text-white">
        {props.node.title}
      </h3>
      <NodeBody body={props.node.body} />
    </div>
  );
}

function RouteNode(props: { readonly node: CrokiCanvasArtifactNodeLike }) {
  return (
    <div className="h-full border-t border-white px-1 pt-4">
      <RoleLabel role={props.node.role} />
      <h3 className="mt-2 text-[16px] leading-5 font-semibold text-white">{props.node.title}</h3>
      <NodeBody body={props.node.body} />
      {props.node.consequence || props.node.whyItMatters ? (
        <p className="mt-4 border-t border-zinc-800 pt-3 text-[11px] leading-4 text-zinc-400">
          {props.node.consequence || props.node.whyItMatters}
        </p>
      ) : null}
    </div>
  );
}

function EvidenceNode(props: { readonly node: CrokiCanvasArtifactNodeLike }) {
  return (
    <div className="h-full border-l border-dashed border-zinc-600 pl-4">
      <Quote className="size-3.5 text-zinc-600" aria-hidden />
      <RoleLabel role={props.node.role} />
      <h3 className="mt-2 text-[14px] leading-5 font-medium text-zinc-100">{props.node.title}</h3>
      <NodeBody body={props.node.body} muted />
      {props.node.references && props.node.references.length > 0 ? (
        <p className="mt-3 text-[10px] text-zinc-600">
          {props.node.references.length} {props.node.references.length === 1 ? "source" : "sources"}
        </p>
      ) : null}
    </div>
  );
}

function ActionNode(props: {
  readonly node: CrokiCanvasArtifactNodeLike;
  readonly ordinal: number;
}) {
  return (
    <div className="flex h-full items-start gap-4 border-t border-zinc-600 pt-3">
      <span className="flex size-8 shrink-0 items-center justify-center border border-zinc-600 font-mono text-[11px] text-zinc-400">
        {String(props.ordinal).padStart(2, "0")}
      </span>
      <div className="min-w-0 flex-1">
        <RoleLabel role={props.node.role} />
        <h3 className="mt-2 text-[14px] leading-5 font-semibold text-white">{props.node.title}</h3>
        <NodeBody body={props.node.body} />
      </div>
    </div>
  );
}

function WarningNode(props: { readonly node: CrokiCanvasArtifactNodeLike }) {
  return (
    <div className="h-full border-l-2 border-amber-400 pl-4">
      <RoleLabel role={props.node.role} warning />
      <h3 className="mt-2 text-[14px] leading-5 font-semibold text-white">{props.node.title}</h3>
      <NodeBody body={props.node.body} />
    </div>
  );
}

function RoleLabel(props: { readonly role: CrokiCanvasArtifactRole; readonly warning?: boolean }) {
  const label =
    props.role === "question" || props.role === "focal"
      ? "Question"
      : props.role === "route"
        ? "Route"
        : props.role === "evidence"
          ? "Evidence"
          : props.role === "action"
            ? "Action"
            : "Contradiction";
  return (
    <p
      className={`text-[10px] tracking-[0.12em] uppercase ${props.warning ? "text-amber-400" : "text-zinc-500"}`}
    >
      {label}
    </p>
  );
}

function NodeBody(props: { readonly body: string | null | undefined; readonly muted?: boolean }) {
  if (!props.body) return null;
  return (
    <p
      className={`mt-3 line-clamp-5 text-[12px] leading-5 ${props.muted ? "text-zinc-400" : "text-zinc-300"}`}
    >
      {props.body}
    </p>
  );
}

function RegistrationFrame() {
  return (
    <>
      <span
        className="pointer-events-none absolute -top-1 -left-1 z-10 h-3 w-3 border-t border-l border-white"
        aria-hidden
      />
      <span
        className="pointer-events-none absolute -top-1 -right-1 z-10 h-3 w-3 border-t border-r border-white"
        aria-hidden
      />
      <span
        className="pointer-events-none absolute -bottom-1 -left-1 z-10 h-3 w-3 border-b border-l border-white"
        aria-hidden
      />
      <span
        className="pointer-events-none absolute -right-1 -bottom-1 z-10 h-3 w-3 border-r border-b border-white"
        aria-hidden
      />
    </>
  );
}
