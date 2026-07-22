import { useRef, type KeyboardEvent } from "react";
import { Box, ChevronDown, GitMerge, Route } from "lucide-react";
import type { FirmSemanticModel, MarketMovementIndex } from "@/types";
import { productGtmTerritoryFor } from "./productGtmLayout";
import { deriveWorkflowRegisters, parseProductGtmWorkflowNodeId, productGtmWorkflowGraph, type ProductGtmWorkflowRegister } from "./productGtmWorkflow";

const PATH_TYPES = new Set(["motion", "mechanism", "pipeline"]);

function pathKind(type: string, properties: Record<string, unknown>, register: ProductGtmWorkflowRegister | undefined) {
  const workflow = productGtmWorkflowGraph(properties);
  if (workflow) return `${register === "established" ? "Established" : "Drafted"} play · ${workflow.steps.length} ${workflow.steps.length === 1 ? "step" : "steps"}`;
  if (type.toLowerCase() === "motion") return "Motion · workflow not mapped";
  if (type.toLowerCase() === "pipeline") return "GTM path · workflow not mapped";
  return "Earned mechanism · workflow not mapped";
}

export function ProductGtmNavigator({ model, movement, selectedRef, onFocus, onDraftPlay }: {
  model: FirmSemanticModel;
  movement: MarketMovementIndex | null;
  selectedRef: string | null;
  onFocus: (ref: string) => void;
  onDraftPlay?: () => void;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  // Register is derived from real market movement, not the play's blob, so an established play truly ran.
  const registers = deriveWorkflowRegisters(model, movement);
  const paths = model.objects.filter((object) => (PATH_TYPES.has(object.type.toLowerCase()) || Boolean(productGtmWorkflowGraph(object.properties)))
    && ["gtm", "shared"].includes(productGtmTerritoryFor(object.type, object.properties)))
    .sort((left, right) => {
      const rank = (object: typeof left) => registers.get(object.id) === "established" ? 2 : productGtmWorkflowGraph(object.properties) ? 1 : 0;
      return rank(right) - rank(left);
    });
  const workflowSelection = parseProductGtmWorkflowNodeId(selectedRef);
  const selectedPath = paths.find((path) => selectedRef === `object:${path.id}` || workflowSelection?.ownerId === path.id) ?? null;
  const primaryWorkflow = (selectedPath && productGtmWorkflowGraph(selectedPath.properties) ? selectedPath : null)
    ?? paths.find((path) => Boolean(productGtmWorkflowGraph(path.properties)))
    ?? null;
  // The selected play's identity already lives in the canvas dock; a shortcut only earns its place when it
  // jumps to a different primary play, never when it mirrors the current selection.
  const selectedIsPrimary = Boolean(primaryWorkflow
    && (selectedRef === `object:${primaryWorkflow.id}` || workflowSelection?.ownerId === primaryWorkflow.id));

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
      <span data-territory="gtm" data-empty={paths.length ? undefined : "true"} title={paths.length ? undefined : "No GTM plays yet"}><Route aria-hidden="true" />GTM</span>
    </div>
    {primaryWorkflow && !selectedIsPrimary ? <button
      className="product-gtm-workflow-shortcut"
      type="button"
      aria-label={`Open ${primaryWorkflow.name} play`}
      onClick={() => onFocus(`object:${primaryWorkflow.id}`)}
    ><strong>{primaryWorkflow.name}</strong><small>{pathKind(primaryWorkflow.type, primaryWorkflow.properties, registers.get(primaryWorkflow.id))}</small></button> : null}
    <details ref={detailsRef} onKeyDown={handleKeyDown} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) close();
    }}>
      <summary aria-label="Browse GTM plays and motions">
        <span>{primaryWorkflow ? "More plays" : "GTM plays"}</span>
        <ChevronDown aria-hidden="true" />
      </summary>
      <nav aria-label="GTM plays and motions">
        <header><strong>GTM plays</strong><span>Ambitious node workflows, drafted in full and established by running.</span>{onDraftPlay ? <button type="button" className="product-gtm-draft-play" onClick={() => { onDraftPlay(); close(); }}>Draft a play with an agent</button> : null}</header>
        {paths.length ? paths.map((path) => <button
          type="button"
          key={path.id}
          aria-label={`${path.name}, ${pathKind(path.type, path.properties, registers.get(path.id))}`}
          aria-current={selectedRef === `object:${path.id}` || workflowSelection?.ownerId === path.id ? "true" : undefined}
          onClick={() => { onFocus(`object:${path.id}`); close(); }}
        >
          <strong>{path.name}</strong>
          <small>{pathKind(path.type, path.properties, registers.get(path.id))}</small>
        </button>) : <p>No GTM play is current yet. Start in conversation and describe the market movement you want to create.</p>}
      </nav>
    </details>
  </aside>;
}
