// The ONE roster tile — the single object that renders a crew teammate's FACE or a capability's brand
// MARK, and is reused everywhere the composer speaks the roster language: the @-mention menu, the
// summoned parts tray, the embodied idea flow, and the pre-run plan checklist. "One inventory, one
// language" — the same tile in four places is what lets the composer carry four features without
// reading as four features.
//
// It resolves its identity from whatever the caller has: a live pipeline node (a `ref` means a
// teammate, a `connector` means a capability), or a direct hint. A teammate wears its pixel face
// (CrewFace, degrading to the family-tinted monogram). A capability wears its real brand mark in the
// brand's own color (identity, not decoration) — and a gated capability (one that reaches the outside
// world) carries the small amber gate dot everywhere it appears.

import { CrewFace } from "@/components/crew/CrewFace";
import { CAPABILITIES, capabilityMark, type Capability } from "@/lib/capabilities";
import type { GTMNode } from "@/types";
import "@/styles/composer-embodied.css";

export type RosterTileSize = "xs" | "sm" | "md";

// The tile's footprint in px, by size — mirrors the mock's .face / .mark size steps.
const SIZE_PX: Record<RosterTileSize, number> = { xs: 22, sm: 26, md: 30 };

// What the tile is asked to draw: a live node it reads identity off of, or a direct teammate/capability.
type RosterTileSource =
  | { node: GTMNode }
  | { kind: "agent" | "skill"; ref: string; job?: string }
  | { kind: "capability"; id: string };

export type RosterTileProps = RosterTileSource & {
  size?: RosterTileSize;
  // Passed through to the teammate face so a working step animates in lockstep with the run.
  state?: "idle" | "working";
  className?: string;
  // Overrides the derived hover title; the tile derives one (role / capability name) otherwise.
  title?: string;
};

// The resolved identity — the one internal shape both branches of the source union collapse to.
type Resolved =
  | { type: "teammate"; ref: string; job?: string }
  | { type: "capability"; cap: Capability }
  | { type: "unknown"; label: string };

function capabilityById(id: string): Capability | null {
  return CAPABILITIES.find((c) => c.id === id) ?? null;
}

function resolve(props: RosterTileSource): Resolved {
  if ("node" in props) {
    const n = props.node;
    // A node with a ref is a rented mind (agent / skill) → a face. A node with a connector is an
    // external service → its brand mark. Priority is ref-first: identity over wiring.
    if (n.ref) return { type: "teammate", ref: n.ref, job: n.label ?? n.agentPrompt };
    if (n.connector) {
      const cap = capabilityById(n.connector);
      return cap ? { type: "capability", cap } : { type: "unknown", label: n.connector };
    }
    return { type: "unknown", label: n.label };
  }
  if (props.kind === "capability") {
    const cap = capabilityById(props.id);
    return cap ? { type: "capability", cap } : { type: "unknown", label: props.id };
  }
  return { type: "teammate", ref: props.ref, job: props.job };
}

// The capability mark: the real open-licensed brand logo in its own color where one exists, else a clean
// lettermark in the brand's tone. A gated capability carries the amber gate dot — the same amber the
// founder gate wears, so "this one reaches the outside world" reads at a glance.
function CapabilityTile({ cap, size, title }: { cap: Capability; size: RosterTileSize; title: string }) {
  const mark = capabilityMark(cap);
  return (
    <span className={`rt rt-mark rt-${size}`} title={title} aria-label={cap.name}>
      {mark ? (
        <svg viewBox="0 0 24 24" fill={`#${mark.hex}`} aria-hidden="true">
          <path d={mark.path} />
        </svg>
      ) : (
        <span className="rt-letter" style={{ color: cap.lettermark!.hex }}>{cap.lettermark!.text}</span>
      )}
      {cap.gated ? <span className="rt-gate-dot" aria-hidden="true" /> : null}
    </span>
  );
}

export function RosterTile({ size = "sm", state = "idle", className, title, ...source }: RosterTileProps) {
  const resolved = resolve(source);
  const wrap = className ? `${className} rt-wrap` : "rt-wrap";

  if (resolved.type === "teammate") {
    return (
      <span className={wrap}>
        <CrewFace
          agentRef={resolved.ref}
          job={resolved.job}
          size={SIZE_PX[size]}
          state={state}
          className="rt-face"
        />
      </span>
    );
  }
  if (resolved.type === "capability") {
    return (
      <span className={wrap}>
        <CapabilityTile cap={resolved.cap} size={size} title={title ?? resolved.cap.name} />
      </span>
    );
  }
  // Never a blank tile: an unresolved step degrades to a neutral monogram of its label.
  const mono = resolved.label.replace(/[^a-zA-Z0-9]/g, "").slice(0, 2).toUpperCase() || "··";
  return (
    <span className={wrap}>
      <span className={`rt rt-mark rt-unknown rt-${size}`} title={title ?? resolved.label} aria-label={resolved.label}>
        <span className="rt-letter">{mono}</span>
      </span>
    </span>
  );
}
