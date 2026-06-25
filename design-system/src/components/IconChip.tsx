import * as React from "react";
import { cn } from "../lib/cn";

/**
 * The known tone tokens an {@link IconChip} can tint to. These are the
 * meaning-bearing colors kept under both skins — the node-category accents
 * (`--cat-*`) and the semantic states — so a chip's hue always reads as the
 * same thing the rest of the system uses it for.
 */
export type ChipTone =
  | "source"
  | "enrich"
  | "filter"
  | "generate"
  | "gate"
  | "execute"
  | "measure"
  | "proven"
  | "gap"
  | "danger"
  | "blind"
  | "agent"
  | "link"
  | "ink";

/** Maps a {@link ChipTone} to the CSS custom property that carries its hue. */
const TONE_VAR: Record<ChipTone, string> = {
  source: "var(--cat-source)",
  enrich: "var(--cat-enrich)",
  filter: "var(--cat-filter)",
  generate: "var(--cat-generate)",
  gate: "var(--cat-gate)",
  execute: "var(--cat-execute)",
  measure: "var(--cat-measure)",
  proven: "var(--proven)",
  gap: "var(--gap)",
  danger: "var(--danger)",
  blind: "var(--blind)",
  agent: "var(--agent)",
  link: "var(--link)",
  ink: "var(--st-ink)",
};

/**
 * Resolve a tone to a CSS color. A known {@link ChipTone} becomes its token
 * `var(--…)`; any other string is passed through verbatim as an escape hatch
 * (e.g. a one-off `var(--cat-source)` or a raw hex).
 */
function resolveTone(tone: ChipTone | (string & {})): string {
  return (TONE_VAR as Record<string, string>)[tone] ?? tone;
}

/** A CSS custom property the chip recipe reads, plus the host's own vars. */
type ChipStyle = React.CSSProperties & { "--chip-tone"?: string };

export interface IconChipProps extends React.ComponentProps<"span"> {
  /**
   * The chip's hue — a known {@link ChipTone} (mapped to its token) or any CSS
   * color string. Drives the `color-mix(... 14%, white)` fill and `24%` border.
   */
  tone?: ChipTone | (string & {});
  /** The glyph rendered inside the chip (an SVG ReactNode; sized by the host). */
  icon: React.ReactNode;
}

/**
 * A small tone-tinted square icon chip (24–26px), the leading mark on cards,
 * rows, and node headers. The fill and border are mixed from a single `tone`
 * via `color-mix`, so one color prop yields a soft, on-brand swatch.
 */
export function IconChip({ tone = "ink", icon, className, style, ...props }: IconChipProps) {
  const chipStyle: ChipStyle = { ...style, "--chip-tone": resolveTone(tone) };
  return (
    <span className={cn("gtm-chip", className)} style={chipStyle} {...props}>
      {icon}
    </span>
  );
}

export interface MetaPillProps extends React.ComponentProps<"span"> {
  /** A leading glyph (an SVG ReactNode or a status dot); optional. */
  icon?: React.ReactNode;
  /** The metadata label (e.g. a duration "0:41", a count, a template name). */
  label: React.ReactNode;
  /**
   * An optional accent color for the label + icon — a known {@link ChipTone} or
   * any CSS color string. Defaults to the muted ink so pills stay quiet.
   */
  accent?: ChipTone | (string & {});
}

/** A CSS custom property the pill reads to tint its label/icon. */
type PillStyle = React.CSSProperties & { "--pill-accent"?: string };

/**
 * A rounded (999px) glass metadata pill: an optional icon plus a short label,
 * bordered with `--st-line-2`. The quiet companion to {@link IconChip} for
 * durations, counts, and template/state tags.
 */
export function MetaPill({ icon, label, accent, className, style, ...props }: MetaPillProps) {
  const pillStyle: PillStyle = {
    ...style,
    ...(accent != null ? { "--pill-accent": resolveTone(accent) } : null),
  };
  return (
    <span
      className={cn("gtm-meta-pill", accent != null && "gtm-meta-pill--accent", className)}
      style={pillStyle}
      {...props}
    >
      {icon != null ? <span className="gtm-meta-pill__icon">{icon}</span> : null}
      {label}
    </span>
  );
}
