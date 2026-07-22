import { useRef, type KeyboardEvent } from "react";
import { Box, ChevronDown, GitMerge, Route } from "lucide-react";
import type { FirmSemanticModel } from "@/types";
import { productGtmTerritoryFor } from "./productGtmLayout";
import { parseProductGtmWorkflowNodeId, productGtmWorkflowGraph } from "./productGtmWorkflow";

const PATH_TYPES = new Set(["motion", "mechanism", "pipeline"]);

function pathKind(type: string, properties: Record<string, unknown>) {
  const workflow = productGtmWorkflowGraph(properties);
  if (workflow) return `Workflow · ${workflow.steps.length} ${workflow.steps.length === 1 ? "step" : "steps"}`;
  if (type.toLowerCase() === "motion") return "Motion · workflow not mapped";
  if (type.toLowerCase() === "pipeline") return "GTM path · workflow not mapped";
  return "Earned mechanism · workflow not mapped";
}

export function ProductGtmNavigator({ model, selectedRef, onFocus }: {
  model: FirmSemanticModel;
  selectedRef: string | null;
  onFocus: (ref: string) => void;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const paths = model.objects.filter((object) => (PATH_TYPES.has(object.type.toLowerCase()) || Boolean(productGtmWorkflowGraph(object.properties)))
    && ["gtm", "shared"].includes(productGtmTerritoryFor(object.type, object.properties)))
    .sort((left, right) => Number(Boolean(productGtmWorkflowGraph(right.properties))) - Number(Boolean(productGtmWorkflowGraph(left.properties))));
  const workflowSelection = parseProductGtmWorkflowNodeId(selectedRef);
  const selectedPath = paths.find((path) => selectedRef === `object:${path.id}` || workflowSelection?.ownerId === path.id) ?? null;
  const primaryWorkflow = (selectedPath && productGtmWorkflowGraph(selectedPath.properties) ? selectedPath : null)
    ?? paths.find((path) => Boolean(productGtmWorkflowGraph(path.properties)))
    ?? null;

  const close = () => {
    if (detailsRef.current) detailsRef.current.open = false;
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLDetailsElement>) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    close();
    detailsRef.current?.querySelector<HTMLElement>("summary")?.focus();
  };

  return <aside className="product-gtm-navigator" aria-label="Product and go-to-market canvas key">
    <div className="product-gtm-territory-key" aria-label="Canvas territories">
      <span data-territory="product"><Box aria-hidden="true" />Product</span>
      <span data-territory="shared"><GitMerge aria-hidden="true" />Shared</span>
      <span data-territory="gtm"><Route aria-hidden="true" />GTM</span>
    </div>
    {primaryWorkflow ? <button
      className="product-gtm-workflow-shortcut"
      type="button"
      aria-label={`Open ${primaryWorkflow.name} workflow`}
      aria-current={selectedRef === `object:${primaryWorkflow.id}` || workflowSelection?.ownerId === primaryWorkflow.id ? "true" : undefined}
      onClick={() => onFocus(`object:${primaryWorkflow.id}`)}
    ><strong>{primaryWorkflow.name}</strong><small>{pathKind(primaryWorkflow.type, primaryWorkflow.properties)}</small></button> : null}
    <details ref={detailsRef} onKeyDown={handleKeyDown} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) close();
    }}>
      <summary aria-label="Browse GTM workflows and motions">
        <span>{primaryWorkflow ? "More paths" : "GTM paths"}</span>
        <ChevronDown aria-hidden="true" />
      </summary>
      <nav aria-label="GTM workflows and motions">
        <header><strong>GTM workflows</strong><span>Open established mechanics or inspect a motion that still needs them.</span></header>
        {paths.length ? paths.map((path) => <button
          type="button"
          key={path.id}
          aria-label={`${path.name}, ${pathKind(path.type, path.properties)}`}
          aria-current={selectedRef === `object:${path.id}` || workflowSelection?.ownerId === path.id ? "true" : undefined}
          onClick={() => { onFocus(`object:${path.id}`); close(); }}
        >
          <strong>{path.name}</strong>
          <small>{pathKind(path.type, path.properties)}</small>
        </button>) : <p>No GTM workflow or motion is current yet.</p>}
      </nav>
    </details>
  </aside>;
}
