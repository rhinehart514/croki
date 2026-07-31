import cytoscape, { type Core, type ElementDefinition, type StylesheetStyle } from "cytoscape";
import { useEffect, useRef } from "react";

import type { CanvasRendererProps } from "../rendererTypes";

export function CytoscapeCanvas(props: CanvasRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const coreRef = useRef<Core | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const core = cytoscape({
      container,
      elements: toElements(props),
      style: styles,
      layout: {
        name: "preset",
        fit: true,
        padding: 70,
      },
      minZoom: 0.35,
      maxZoom: 1.8,
      wheelSensitivity: 0.22,
      selectionType: "single",
    });
    coreRef.current = core;
    core.on("tap", "node", (event) => {
      const node = props.projection.nodes.find((candidate) => candidate.id === event.target.id());
      props.onSelect(node ?? null);
    });
    core.on("tap", (event) => {
      if (event.target === core) props.onSelect(null);
    });
    return () => {
      core.destroy();
      coreRef.current = null;
    };
  }, [props.projection]);

  useEffect(() => {
    const core = coreRef.current;
    if (!core) return;
    core.elements().unselect();
    if (props.selectedId) core.getElementById(props.selectedId).select();
  }, [props.selectedId]);

  return <div ref={containerRef} className="cytoscape-host" />;
}

function toElements(props: CanvasRendererProps): ElementDefinition[] {
  const nodes: ElementDefinition[] = props.projection.nodes.map((node) => ({
    data: {
      id: node.id,
      title: node.title,
      kind: node.kind,
      authority: node.authority,
      meta: node.meta,
    },
    position: { x: node.x, y: node.y },
    classes: `authority-${node.authority}`,
    selected: node.id === props.selectedId,
  }));
  const edges: ElementDefinition[] = props.projection.edges.map((edge) => ({
    data: { id: edge.id, source: edge.from, target: edge.to, label: edge.relation },
  }));
  return [...nodes, ...edges];
}

const styles: StylesheetStyle[] = [
  {
    selector: "node",
    style: {
      width: 210,
      height: 88,
      shape: "round-rectangle",
      "background-color": "#0b0b0d",
      "border-color": "#37373d",
      "border-width": 1,
      label: "data(title)",
      color: "#f5f5f5",
      "font-family": "Inter, sans-serif",
      "font-size": 13,
      "font-weight": 600,
      "text-wrap": "wrap",
      "text-max-width": "174px",
      "text-valign": "center",
      "text-halign": "center",
      "overlay-opacity": 0,
    },
  },
  {
    selector: "node:selected",
    style: {
      "border-color": "#ffffff",
      "border-width": 2,
    },
  },
  { selector: ".authority-current", style: { "border-color": "#6ee7b7" } },
  { selector: ".authority-provisional", style: { "border-color": "#fbbf24" } },
  { selector: ".authority-run", style: { "border-color": "#60a5fa" } },
  {
    selector: "edge",
    style: {
      width: 1.2,
      "line-color": "#44444b",
      "target-arrow-color": "#62626a",
      "target-arrow-shape": "triangle",
      "curve-style": "bezier",
      label: "data(label)",
      color: "#808088",
      "font-size": 9,
      "text-background-color": "#000000",
      "text-background-opacity": 0.9,
      "text-background-padding": "3px",
      "overlay-opacity": 0,
    },
  },
];
