import { ChevronLeft, ChevronRight, Info, RotateCcw } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";

import {
  canvasModes,
  canvasSdks,
  projections,
  sdkDetails,
  type CanvasMode,
  type CanvasSdk,
  type LabNode,
} from "./model";
import type { CanvasRendererProps } from "./rendererTypes";
import { SelectionInspector } from "./SelectionInspector";

const renderers: Readonly<
  Record<CanvasSdk, React.LazyExoticComponent<React.ComponentType<CanvasRendererProps>>>
> = {
  "react-flow": lazy(() =>
    import("./renderers/ReactFlowCanvas").then((module) => ({ default: module.ReactFlowCanvas })),
  ),
  tldraw: lazy(() =>
    import("./renderers/TldrawCanvas").then((module) => ({ default: module.TldrawCanvas })),
  ),
  konva: lazy(() =>
    import("./renderers/KonvaCanvas").then((module) => ({ default: module.KonvaCanvas })),
  ),
  excalidraw: lazy(() =>
    import("./renderers/ExcalidrawCanvas").then((module) => ({
      default: module.ExcalidrawCanvas,
    })),
  ),
  cytoscape: lazy(() =>
    import("./renderers/CytoscapeCanvas").then((module) => ({
      default: module.CytoscapeCanvas,
    })),
  ),
};

export function CanvasSdkLab() {
  const [sdk, setSdk] = useState<CanvasSdk>("react-flow");
  const [mode, setMode] = useState<CanvasMode>("product");
  const [selectedId, setSelectedId] = useState<string | null>("intent");
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [briefOpen, setBriefOpen] = useState(false);
  const projection = projections[mode];
  const selectedNode = useMemo(
    () => projection.nodes.find((node) => node.id === selectedId) ?? null,
    [projection, selectedId],
  );
  const Renderer = renderers[sdk];
  const handleSelect = useCallback((node: LabNode | null) => {
    setSelectedId(node?.id ?? null);
    if (node) setInspectorOpen(true);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }
      const index = Number(event.key) - 1;
      if (index >= 0 && index < canvasSdks.length) {
        setSdk(canvasSdks[index] ?? "react-flow");
      } else if (event.key === "Escape") {
        setSelectedId(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <main className="lab-shell">
      <header className="topbar">
        <div className="brand-block">
          <span className="croki-mark" aria-hidden>
            C
          </span>
          <div>
            <h1>Canvas SDK Lab</h1>
            <p>One Croki model, five interaction substrates</p>
          </div>
        </div>
        <nav className="sdk-tabs" aria-label="Canvas SDK">
          {canvasSdks.map((candidate, index) => (
            <button
              key={candidate}
              type="button"
              aria-current={sdk === candidate ? "page" : undefined}
              onClick={() => setSdk(candidate)}
            >
              <span>{sdkDetails[candidate].label}</span>
              <kbd>{index + 1}</kbd>
            </button>
          ))}
        </nav>
        <button
          className="icon-button"
          type="button"
          aria-label="Show experiment brief"
          aria-pressed={briefOpen}
          onClick={() => setBriefOpen((value) => !value)}
        >
          <Info size={16} />
        </button>
      </header>

      <section className="contextbar">
        <div className="mode-tabs" aria-label="Canvas projection">
          {canvasModes.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              aria-current={mode === candidate.id ? "page" : undefined}
              onClick={() => {
                setMode(candidate.id);
                setSelectedId(projections[candidate.id].nodes[0]?.id ?? null);
              }}
            >
              {candidate.label}
            </button>
          ))}
        </div>
        <div className="projection-title">
          <strong>{projection.title}</strong>
          <span>{projection.purpose}</span>
        </div>
        <button
          className="reset-button"
          type="button"
          onClick={() => setSelectedId(projection.nodes[0]?.id ?? null)}
        >
          <RotateCcw size={13} /> Reset selection
        </button>
      </section>

      <section className={`workspace ${inspectorOpen ? "inspector-visible" : ""}`}>
        <div className="canvas-stage" aria-label={`${sdkDetails[sdk].label} Canvas prototype`}>
          <Suspense fallback={<CanvasLoading label={sdkDetails[sdk].label} />}>
            <Renderer
              key={`${sdk}:${mode}`}
              projection={projection}
              selectedId={selectedId}
              onSelect={handleSelect}
            />
          </Suspense>
          <div className="substrate-note">
            <strong>{sdkDetails[sdk].description}</strong>
            <span>{sdkDetails[sdk].consequence}</span>
          </div>
        </div>

        <button
          type="button"
          className="inspector-toggle"
          aria-label={inspectorOpen ? "Close selection inspector" : "Open selection inspector"}
          onClick={() => setInspectorOpen((value) => !value)}
        >
          {inspectorOpen ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>

        {inspectorOpen ? (
          <SelectionInspector
            mode={mode}
            node={selectedNode}
            sdk={sdk}
            onClose={() => {
              setSelectedId(null);
              setInspectorOpen(false);
            }}
          />
        ) : null}
      </section>

      {briefOpen ? <ExperimentBrief onClose={() => setBriefOpen(false)} /> : null}
    </main>
  );
}

function CanvasLoading(props: { readonly label: string }) {
  return (
    <div className="canvas-loading" role="status">
      Loading {props.label}…
    </div>
  );
}

function ExperimentBrief(props: { readonly onClose: () => void }) {
  return (
    <aside className="experiment-brief" aria-label="Experiment brief">
      <header>
        <span>Evaluation contract</span>
        <button type="button" onClick={props.onClose}>
          Close
        </button>
      </header>
      <h2>The SDK is not the product</h2>
      <p>
        Every tab receives the same Croki projection. Select and move items, change views, then
        judge how much of the package remains visible as machinery.
      </p>
      <dl>
        <div>
          <dt>Must remain</dt>
          <dd>Threads, native Runs, exact Review, repository truth</dd>
        </div>
        <div>
          <dt>Canvas may own</dt>
          <dd>Projection, placement, selection, workflow composition</dd>
        </div>
        <div>
          <dt>Canvas may not own</dt>
          <dd>A second runtime, memory system, or authority model</dd>
        </div>
      </dl>
      <div className="comparison-grid" role="table" aria-label="SDK comparison">
        <div role="row" className="comparison-heading">
          <span role="columnheader">SDK</span>
          <span role="columnheader">Native idea</span>
          <span role="columnheader">Surface</span>
        </div>
        {comparisonRows.map((row) => (
          <div role="row" key={row.sdk}>
            <strong role="cell">{row.sdk}</strong>
            <span role="cell">{row.idea}</span>
            <i role="cell">{row.surface}</i>
          </div>
        ))}
      </div>
    </aside>
  );
}

const comparisonRows = [
  { sdk: "React Flow", idea: "Semantic graph", surface: "Low" },
  { sdk: "tldraw", idea: "Whiteboard", surface: "High" },
  { sdk: "Konva", idea: "Custom scene", surface: "Croki-owned" },
  { sdk: "Excalidraw", idea: "Founder sketch", surface: "High" },
  { sdk: "Cytoscape", idea: "Graph analysis", surface: "Medium" },
] as const;
