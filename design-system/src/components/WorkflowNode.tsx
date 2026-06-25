import * as React from "react";
import { cn } from "../lib/cn";

export type NodeCategory =
  | "source"
  | "enrich"
  | "filter"
  | "generate"
  | "gate"
  | "execute"
  | "measure";

export interface WorkflowNodeProps extends React.ComponentProps<"button"> {
  category: NodeCategory;
  label: React.ReactNode;
  /** The category glyph (12px), shown in the node's icon chip. */
  icon?: React.ReactNode;
  /** A connector/agent ref shown faintly at top-right (e.g. "agent:gtm-enrich"). */
  connector?: React.ReactNode;
  /** A status glyph at top-right (a check, a spinner, a gate lock). */
  status?: React.ReactNode;
  /** An item/row count line (e.g. "128 accounts"). */
  count?: React.ReactNode;
  /** An error message — also paints the node in the error treatment. */
  error?: React.ReactNode;
  selected?: boolean;

  /* ── Rich form (the demos.jsx NodeCard) ──────────────────────────────────
     Supplying any of `autoRun`, `cost`, `fields`, or `rich` promotes the node
     to the richer canvas card: a category-tinted icon chip, a title row with a
     settings gear, a divider, and a meta block. The simple props above keep
     working unchanged when none of these are set. */

  /** Promote to the rich card explicitly, even with no meta values yet. */
  rich?: boolean;
  /**
   * Auto-Run state shown as a meta row. `true`/`"enabled"` → "Enabled" (link),
   * `false`/`"disabled"` → "Disabled" (danger). Omit to hide the row. Pass a
   * ReactNode to render a fully custom value.
   */
  autoRun?: boolean | "enabled" | "disabled" | React.ReactNode;
  /**
   * Cost shown as a meta row. A number/string (e.g. `1`) renders the value with
   * a coin glyph; `"Free"` (case-insensitive) renders muted with no coin. Pass a
   * ReactNode for a fully custom value. Omit to hide the row.
   */
  cost?: number | string | React.ReactNode;
  /** Mapped-fields count shown as a meta row (e.g. `9`). Omit to hide the row. */
  fields?: React.ReactNode;
  /** The settings-gear glyph for the title row's gear slot (rich form only). */
  gear?: React.ReactNode;
}

const CATEGORY_LABEL: Record<NodeCategory, string> = {
  source: "Source",
  enrich: "Enrich",
  filter: "Filter",
  generate: "Generate",
  gate: "Gate",
  execute: "Execute",
  measure: "Measure",
};

/** The category accent CSS variable for a given node category. */
function categoryAccent(category: NodeCategory): string {
  return `var(--cat-${category})`;
}

/** Is this `autoRun` value the "disabled" treatment? */
function isAutoRunOff(value: WorkflowNodeProps["autoRun"]): boolean {
  return value === false || value === "disabled";
}

/** Is this `autoRun` value one of the built-in boolean/string forms (vs a node)? */
function isAutoRunBuiltin(value: WorkflowNodeProps["autoRun"]): boolean {
  return (
    value === true ||
    value === false ||
    value === "enabled" ||
    value === "disabled"
  );
}

/** Render the Auto-Run meta value: built-in Enabled/Disabled, or a custom node. */
function renderAutoRunValue(value: WorkflowNodeProps["autoRun"]): React.ReactNode {
  if (!isAutoRunBuiltin(value)) return value as React.ReactNode;
  return isAutoRunOff(value) ? (
    <span className="gtm-node__meta-off">Disabled</span>
  ) : (
    <span className="gtm-node__meta-on">Enabled</span>
  );
}

/** Is this `cost` value the free treatment (muted, no coin)? */
function isFreeCost(value: WorkflowNodeProps["cost"]): boolean {
  return typeof value === "string" && value.trim().toLowerCase() === "free";
}

/** Should this `cost` value render as a plain number/string with a coin glyph? */
function isScalarCost(value: WorkflowNodeProps["cost"]): boolean {
  return typeof value === "number" || typeof value === "string";
}

/** Render the Cost meta value: Free (muted), scalar + coin, or a custom node. */
function renderCostValue(value: WorkflowNodeProps["cost"]): React.ReactNode {
  if (isFreeCost(value)) return <span className="gtm-node__meta-free">Free</span>;
  if (!isScalarCost(value)) return value as React.ReactNode;
  return (
    <span className="gtm-node__cost">
      {value as React.ReactNode}
      <span aria-hidden className="gtm-node__coin" />
    </span>
  );
}

/**
 * The signature element: a step card on the GTM graph. Its top-accent encodes
 * the step category (the one place hue carries node meaning).
 *
 * Two forms share one component:
 *
 * - **Simple** (default) — category eyebrow, icon, label, and an optional count.
 *   Driven by {@link WorkflowNodeProps.category}, `label`, `icon`, `count`, etc.
 * - **Rich** — the canvas card from the editor: a category-tinted icon chip, a
 *   title row with a settings gear, a divider, and Auto-Run / Cost / Mapped
 *   fields meta rows. Opt in via {@link WorkflowNodeProps.rich} or by supplying
 *   any of `autoRun`, `cost`, or `fields`.
 */
export function WorkflowNode({
  category,
  label,
  icon,
  connector,
  status,
  count,
  error,
  selected,
  rich,
  autoRun,
  cost,
  fields,
  gear,
  className,
  style,
  ...props
}: WorkflowNodeProps) {
  const isRich =
    rich === true || autoRun != null || cost != null || fields != null;

  // The accent the rich chip + top bar tint from. Exposed as a CSS custom
  // property so the chip fill/border and ::before bar all read one source.
  const accentStyle = {
    ["--node-accent" as string]: categoryAccent(category),
    ...style,
  } as React.CSSProperties;

  if (!isRich) {
    return (
      <button
        type="button"
        className={cn(
          "gtm-node",
          `gtm-node--${category}`,
          selected && "gtm-node--selected",
          error && "gtm-node--error",
          className,
        )}
        style={accentStyle}
        {...props}
      >
        <span className="gtm-node__header">
          <span className="gtm-node__icon">{icon}</span>
          <span className="gtm-node__header-right">
            {connector != null ? (
              <span className="gtm-node__connector">{connector}</span>
            ) : null}
            {status != null ? (
              <span className="gtm-node__status">{status}</span>
            ) : null}
          </span>
        </span>
        <span className="gtm-node__category">{CATEGORY_LABEL[category]}</span>
        <span className="gtm-node__label">{label}</span>
        {count != null ? <span className="gtm-node__count">{count}</span> : null}
        {error != null ? (
          <span className="gtm-node__error-text">{error}</span>
        ) : null}
      </button>
    );
  }

  const hasMeta = autoRun != null || cost != null || fields != null;

  return (
    <button
      type="button"
      className={cn(
        "gtm-node",
        "gtm-node--rich",
        `gtm-node--${category}`,
        selected && "gtm-node--selected",
        error && "gtm-node--error",
        className,
      )}
      style={accentStyle}
      {...props}
    >
      <span className="gtm-node__top">
        <span className="gtm-node__chip">{icon}</span>
        <span className="gtm-node__title">{label}</span>
        {connector != null ? (
          <span className="gtm-node__connector">{connector}</span>
        ) : null}
        {status != null ? (
          <span className="gtm-node__status">{status}</span>
        ) : null}
        <span className="gtm-node__gear">{gear}</span>
      </span>

      {hasMeta ? <span className="gtm-node__rule" /> : null}

      {hasMeta ? (
        <span className="gtm-node__meta">
          {autoRun != null ? (
            <span className="gtm-node__meta-row">
              <span className="gtm-node__meta-key">Auto-Run</span>
              <span className="gtm-node__meta-val">
                {renderAutoRunValue(autoRun)}
              </span>
            </span>
          ) : null}
          {cost != null ? (
            <span className="gtm-node__meta-row">
              <span className="gtm-node__meta-key">Cost</span>
              <span className="gtm-node__meta-val">{renderCostValue(cost)}</span>
            </span>
          ) : null}
          {fields != null ? (
            <span className="gtm-node__meta-row">
              <span className="gtm-node__meta-key">Mapped fields</span>
              <span className="gtm-node__meta-val gtm-node__meta-strong">
                {fields}
              </span>
            </span>
          ) : null}
        </span>
      ) : null}

      {error != null ? (
        <span className="gtm-node__error-text">{error}</span>
      ) : null}
    </button>
  );
}
