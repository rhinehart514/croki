import {
  MarkerType,
  ReactFlow,
  useNodesState,
  type Edge,
  type NodeMouseHandler,
} from "@xyflow/react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";

import {
  buildCrokiCanvasArtifactLayout,
  crokiCanvasArtifactLayoutBucket,
  type CrokiCanvasArtifactRole,
} from "./crokiCanvasArtifactLayout";
import {
  crokiCanvasArtifactObjectTypes,
  type CrokiCanvasArtifactObject,
  type CrokiCanvasArtifactObjectData,
} from "./CrokiCanvasArtifactObjects";
import type {
  CrokiCanvasArtifactLike,
  CrokiCanvasArtifactPositions,
} from "./crokiCanvasArtifactTypes";

export function CrokiCanvasArtifactField(props: {
  readonly artifact: CrokiCanvasArtifactLike;
  readonly selectedIds: readonly string[];
  readonly onSelect: (ids: readonly string[]) => void;
}) {
  const { artifact, onSelect, selectedIds } = props;
  const rootRef = useRef<HTMLDivElement>(null);
  const [fieldWidth, setFieldWidth] = useState(720);
  const [positions, setPositions] = useState<CrokiCanvasArtifactPositions>({});
  const layoutBucket = crokiCanvasArtifactLayoutBucket(fieldWidth);
  const positionKey = `croki-harness-canvas:${artifact.threadId}:${artifact.presentation}`;

  useLayoutEffect(() => {
    const element = rootRef.current;
    if (!element) return;
    const measure = () => setFieldWidth(element.getBoundingClientRect().width);
    measure();
    window.addEventListener("resize", measure);
    if (typeof ResizeObserver === "undefined") {
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      window.removeEventListener("resize", measure);
      observer.disconnect();
    };
  }, []);
  useEffect(() => setPositions(loadArtifactPositions(positionKey)), [positionKey]);

  const derivedPositions = useMemo(
    () =>
      buildCrokiCanvasArtifactLayout({
        nodes: artifact.nodes,
        edges: artifact.edges,
        fieldWidth,
        presentation: artifact.presentation,
      }),
    [artifact, fieldWidth],
  );

  const toggleNode = useCallback(
    (id: string, event?: MouseEvent<HTMLButtonElement>) => {
      const additive = Boolean(event?.shiftKey || event?.metaKey || event?.ctrlKey);
      if (!additive) {
        onSelect([id]);
        return;
      }
      onSelect(
        selectedIds.includes(id)
          ? selectedIds.filter((selectedId) => selectedId !== id)
          : [...selectedIds, id],
      );
    },
    [onSelect, selectedIds],
  );

  const projectedNodes = useMemo(() => {
    const ordinalByRole = new Map<CrokiCanvasArtifactRole, number>();
    return artifact.nodes.map((node): CrokiCanvasArtifactObject => {
      const ordinal = (ordinalByRole.get(node.role) ?? 0) + 1;
      ordinalByRole.set(node.role, ordinal);
      const dimensions = artifactNodeDimensions(node.role, layoutBucket);
      const data: CrokiCanvasArtifactObjectData = {
        node,
        ordinal,
        selected: selectedIds.includes(node.id),
        onSelect: (id) => onSelect([id]),
        onSelectWithEvent: (id, event) => toggleNode(id, event),
      };
      return {
        id: node.id,
        type: "artifact-object",
        position: positions[node.id] ?? derivedPositions[node.id] ?? { x: 32, y: 32 },
        width: dimensions.width,
        height: dimensions.height,
        selectable: true,
        draggable: true,
        data,
      };
    });
  }, [
    derivedPositions,
    layoutBucket,
    positions,
    artifact.nodes,
    onSelect,
    selectedIds,
    toggleNode,
  ]);

  const [nodes, setNodes, onNodesChange] = useNodesState<CrokiCanvasArtifactObject>(projectedNodes);
  useEffect(() => setNodes(projectedNodes), [projectedNodes, setNodes]);

  const edges = useMemo<Edge[]>(() => {
    const selected = new Set(selectedIds);
    return artifact.edges.flatMap((edge, index) => {
      if (!artifact.nodes.some((node) => node.id === edge.from)) return [];
      if (!artifact.nodes.some((node) => node.id === edge.to)) return [];
      const emphasized = selected.has(edge.from) || selected.has(edge.to);
      return [
        {
          id: `${edge.from}:${edge.relation}:${edge.to}:${index}`,
          source: edge.from,
          target: edge.to,
          type: "default",
          selectable: false,
          label: emphasized ? edge.relation : undefined,
          markerEnd: { type: MarkerType.ArrowClosed, color: emphasized ? "#d4d4d8" : "#27272a" },
          style: { stroke: emphasized ? "#d4d4d8" : "#27272a", strokeWidth: emphasized ? 1.25 : 1 },
          labelStyle: { fill: emphasized ? "#d4d4d8" : "#52525b", fontSize: 10 },
          labelBgStyle: { fill: "#000", fillOpacity: 0.94 },
          labelBgPadding: [5, 2],
          labelBgBorderRadius: 0,
        },
      ];
    });
  }, [artifact.edges, artifact.nodes, selectedIds]);

  const onNodeClick: NodeMouseHandler<CrokiCanvasArtifactObject> = useCallback(
    (event, node) => toggleNode(node.id, event as unknown as MouseEvent<HTMLButtonElement>),
    [toggleNode],
  );

  if (artifact.nodes.length === 0) {
    return (
      <div ref={rootRef} className="flex h-full min-h-72 items-center justify-center bg-black p-8">
        <p className="text-sm text-zinc-500">This visual has no presentable objects.</p>
      </div>
    );
  }
  return (
    <div
      ref={rootRef}
      className="relative h-full min-h-72 bg-black"
      data-canvas-layout={layoutBucket}
    >
      <ReactFlow<CrokiCanvasArtifactObject>
        key={`${artifact.id}:${artifact.revision}:${layoutBucket}`}
        aria-label="Harness Canvas field"
        className="!bg-black"
        colorMode="dark"
        nodes={nodes}
        edges={edges}
        nodeTypes={crokiCanvasArtifactObjectTypes}
        onNodesChange={onNodesChange}
        onNodeClick={onNodeClick}
        onPaneClick={() => onSelect([])}
        onSelectionChange={({ nodes: selectedNodes }) =>
          onSelect(selectedNodes.map((node) => node.id))
        }
        onNodeDragStop={(_, dragged) => {
          const next = Object.fromEntries(
            nodes.map((node) => [
              node.id,
              node.id === dragged.id ? dragged.position : node.position,
            ]),
          );
          setPositions(next);
          persistArtifactPositions(positionKey, next);
        }}
        fitView
        fitViewOptions={{ padding: layoutBucket === "wide" ? 0.18 : 0.1, minZoom: 0.6, maxZoom: 1 }}
        minZoom={0.45}
        maxZoom={1.5}
        nodesDraggable
        nodesConnectable={false}
        nodesFocusable={false}
        selectionOnDrag
        panOnDrag
        zoomOnDoubleClick={false}
        proOptions={{ hideAttribution: true }}
      />
    </div>
  );
}

function artifactNodeDimensions(
  role: CrokiCanvasArtifactRole,
  bucket: "wide" | "medium" | "narrow",
) {
  const isQuestion = role === "question" || role === "focal";
  return {
    width: isQuestion ? (bucket === "wide" ? 420 : 280) : bucket === "wide" ? 280 : 240,
    height: isQuestion ? 170 : role === "evidence" ? 150 : 174,
  } as const;
}

function loadArtifactPositions(key: string): CrokiCanvasArtifactPositions {
  if (typeof window === "undefined") return {};
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(key) ?? "null");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).flatMap(([id, value]) => {
        if (
          value &&
          typeof value === "object" &&
          "x" in value &&
          "y" in value &&
          typeof value.x === "number" &&
          typeof value.y === "number"
        ) {
          return [[id, { x: value.x, y: value.y }]];
        }
        return [];
      }),
    );
  } catch {
    return {};
  }
}

function persistArtifactPositions(key: string, positions: CrokiCanvasArtifactPositions): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(positions));
  } catch {
    // Position persistence is a convenience, never a rendering prerequisite.
  }
}
