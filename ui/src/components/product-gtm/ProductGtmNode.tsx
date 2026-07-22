import { memo } from "react";
import { Bot, Box, ChevronUp, CircleHelp, Eye, FlaskConical, GitBranch, GitFork, MessageCircleReply, Play, Puzzle, Radio, Route, Send, ShieldCheck, Target, Waypoints, type LucideIcon } from "lucide-react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { ProductGtmNode as ProductGtmFlowNode, ProductGtmNodeRole } from "./productGtmProjection";

const ICON: Record<ProductGtmNodeRole, LucideIcon> = {
  direction: Target, feature: Puzzle, product: Box, path: Route, "market-signal": Radio, route: Waypoints, "market-test": FlaskConical,
  "evidence-gap": CircleHelp, provisional: CircleHelp, work: Bot, branch: GitBranch,
  outward: Send, gate: ShieldCheck, evidence: MessageCircleReply,
  "workflow-step": GitFork,
};

const WORKFLOW_ICON: Record<NonNullable<ProductGtmFlowNode["data"]["workflowStepType"]>, LucideIcon> = {
  trigger: Play, "agent-work": Bot, condition: GitFork, "founder-decision": ShieldCheck,
  "founder-gate": ShieldCheck, "external-action": Send, observation: Eye, outcome: MessageCircleReply,
};

const OVERVIEW_ROLE: Record<ProductGtmNodeRole, string> = {
  direction: "Direction", feature: "Product detail", product: "Product truth", path: "Market path",
  "market-signal": "Market reality", route: "Route to market", "market-test": "Market test",
  "evidence-gap": "Evidence needed", provisional: "Provisional read", work: "Exact work", branch: "Alternative",
  outward: "Outward action", gate: "Founder decision", evidence: "Evidence returned", "workflow-step": "Workflow step",
};

function ProductGtmNodeView({ data, selected, sourcePosition, targetPosition }: NodeProps<ProductGtmFlowNode>) {
  const Icon = data.workflowStepType ? WORKFLOW_ICON[data.workflowStepType] : ICON[data.role];
  const territory = data.territory === "gtm" ? "GTM" : data.territory === "product" ? "Product" : data.territory === "shared" ? "Shared" : "Unplaced";
  const overviewName = data.primary || data.attention || data.focus ? data.name : OVERVIEW_ROLE[data.role];
  const overviewState = data.attention === "decision" ? "Needs you" : data.attention === "evidence" ? "Evidence returned" : data.active ? "Working now" : data.primary ? "Focal path" : "Supporting context";
  return <article className="product-gtm-node" data-kind={data.kind} data-role={data.role} data-workflow={data.workflowGraph ? "true" : undefined} data-workflow-step={data.workflowStepType} data-territory={data.territory} data-expanded={data.expanded ? "true" : undefined} data-selected={selected ? "true" : undefined} data-provisional={data.provisional ? "true" : undefined} data-primary={data.primary ? "true" : "false"} data-focus={data.focus ? "true" : "false"} data-active={data.active ? "true" : undefined} data-attention={data.attention} data-waiting={data.waiting ? "true" : undefined}>
    <Handle type="target" position={targetPosition ?? Position.Left} />
    {data.acceptsWork ? <Handle id="work-target" className="product-gtm-work-port" type="target" position={Position.Bottom} /> : null}
    <div className="product-gtm-node-summary">
      <span className="product-gtm-node-symbol"><Icon aria-hidden="true" /></span>
      <span className="product-gtm-node-copy"><strong>{data.name}</strong><small><b>{territory}</b><span>{data.meta}</span></small></span>
      {data.expanded ? <button className="nodrag product-gtm-node-collapse" type="button" aria-label="Collapse node" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); data.onCollapse?.(); }}><ChevronUp aria-hidden="true" /></button> : null}
    </div>
    <div className="product-gtm-node-overview" aria-label={`${overviewName}, ${territory}, ${overviewState}`}>
      <span className="product-gtm-node-symbol"><Icon aria-hidden="true" /></span>
      <span><strong>{overviewName}</strong><small><b>{territory}</b><span>{overviewState}</span></small></span>
    </div>
    {data.expanded ? <div className="nodrag product-gtm-node-expanded" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
      {data.detail && !data.expandedContent ? <p>{data.detail}</p> : null}
      {data.kind === "action" && !data.expandedContent ? <section className="product-gtm-node-authority"><small>Founder authority</small><strong>Nothing crosses into the world until you act here.</strong></section> : null}
      {data.kind === "evidence" && !data.expandedContent ? <section className="product-gtm-node-return"><small>Reality returned</small><strong>This evidence stays attached to the Product or GTM claim it can change.</strong></section> : null}
      {data.expandedContent}
      {data.actionLabel ? <button className="product-gtm-node-action" type="button" onClick={() => data.onAction?.()}>{data.actionLabel}</button> : null}
    </div> : null}
    <Handle id={data.role === "work" ? "work-source" : undefined} type="source" position={sourcePosition ?? Position.Right} />
  </article>;
}

export const ProductGtmNode = memo(ProductGtmNodeView);
