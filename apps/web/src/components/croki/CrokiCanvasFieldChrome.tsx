import type { CrokiContextEdge } from "@t3tools/shared/crokiContext";

import { crokiCanvasItemTitle, type CrokiCanvasItem } from "./crokiCanvasItems";

export function CrokiCanvasEdgeRail(props: {
  readonly edge: CrokiContextEdge;
  readonly items: readonly CrokiCanvasItem[];
  readonly onRemove: () => void;
  readonly onReplace: (next: CrokiContextEdge) => void;
}) {
  const commitRelation = (value: string) => {
    const relation = value.trim();
    if (relation && relation !== props.edge.relation) {
      props.onReplace({ ...props.edge, relation });
    }
  };
  return (
    <div className="croki-canvas-edge-rail-enter flex min-h-11 shrink-0 items-center gap-3 border-t border-white/15 bg-black px-4 text-xs">
      <span className="min-w-0 truncate text-zinc-300">
        {titleFor(props.items, props.edge.from)}
      </span>
      <input
        key={crokiCanvasEdgeId(props.edge)}
        aria-label="Relationship"
        className="h-8 w-24 border-x border-white/15 bg-black px-2 text-center text-xs text-white outline-none focus:border-white/35"
        defaultValue={props.edge.relation}
        onBlur={(event) => commitRelation(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            commitRelation(event.currentTarget.value);
            event.currentTarget.blur();
          }
          if (event.key === "Escape") {
            event.currentTarget.value = props.edge.relation;
            event.currentTarget.blur();
          }
        }}
      />
      <span className="min-w-0 flex-1 truncate text-zinc-300">
        {titleFor(props.items, props.edge.to)}
      </span>
      <button
        type="button"
        className="h-8 text-zinc-400 hover:text-white"
        onClick={() => props.onReplace({ ...props.edge, from: props.edge.to, to: props.edge.from })}
      >
        Reverse
      </button>
      <button type="button" className="h-8 text-zinc-300 hover:text-white" onClick={props.onRemove}>
        Remove relation
      </button>
    </div>
  );
}

export function CrokiCanvasFieldFooter(props: {
  readonly hasCustomLayout: boolean;
  readonly onResetLayout: () => void;
}) {
  return (
    <div className="flex h-7 shrink-0 items-center justify-end gap-4 border-t border-white/5 bg-black px-4 text-[11px] text-zinc-500">
      <span>Drag objects · hover an object to relate</span>
      {props.hasCustomLayout ? (
        <button
          type="button"
          className="text-zinc-400 hover:text-white"
          onClick={props.onResetLayout}
        >
          Reset layout
        </button>
      ) : null}
    </div>
  );
}

export function crokiCanvasEdgeId(edge: CrokiContextEdge, edgeKind = "semantic"): string {
  return encodeURIComponent(JSON.stringify([edgeKind, edge.from, edge.relation, edge.to]));
}

function titleFor(items: readonly CrokiCanvasItem[], id: string): string {
  const item = items.find((candidate) => candidate.id === id);
  return item ? crokiCanvasItemTitle(item) : id;
}
