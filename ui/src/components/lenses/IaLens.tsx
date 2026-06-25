// IaLens — "IA": the product's information architecture as a TREE / sitemap.
//
// Each ProductIaNode carries a `parentId` (the parent's id OR its name; "" = top-level). This lens
// rebuilds that parent-linked hierarchy and renders it as an indented, collapsible tree of the
// shared ObjectCard — one calm column of the same card every other lens uses, so the sitemap reads
// continuous with the conceptual graph and the workflow chain rather than as a fifth diagram.
//
// Provenance is load-bearing per node (ObjectCard ghosts a speculative area and tags it). Each area
// also shows which `relatedThings` it surfaces, so the founder can see what a section actually puts
// in front of the user. Selection is the shared cross-lens id: touching an area here keeps it lit
// when the founder flips to the conceptual or workflow lens.

import { useMemo, useState } from "react";
import { ChevronRight, CornerDownRight, GitBranch } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProductIaNode, ProductModel, ProductModelEdit } from "@/types";
import { LensPanel, ObjectCard } from "@/components/lenses/shared";
import "./IaLens.css";

export type LensProps = {
  model: ProductModel;
  selected: string | null;
  onSelect: (id: string) => void;
  onRevise: (edit: ProductModelEdit) => void;
};

// A node plus its resolved children — the tree the flat parentId list builds into.
type IaTreeNode = {
  node: ProductIaNode;
  children: IaTreeNode[];
  depth: number;
};

// Resolve the flat ia bag into a forest. parentId may point at a parent's id OR its name (the
// modeler emits either), and "" means top-level. Anything whose parent can't be resolved — a
// dangling ref, or a cycle we'd otherwise drop — is surfaced at the top level so no area silently
// disappears from the sitemap.
function buildForest(ia: ProductIaNode[]): IaTreeNode[] {
  const byId = new Map<string, ProductIaNode>();
  const byName = new Map<string, ProductIaNode>();
  for (const n of ia) {
    byId.set(n.id, n);
    if (n.name) byName.set(n.name.toLowerCase(), n);
  }

  const resolveParent = (n: ProductIaNode): ProductIaNode | null => {
    const ref = (n.parentId || "").trim();
    if (!ref) return null;
    const hit = byId.get(ref) ?? byName.get(ref.toLowerCase()) ?? null;
    return hit && hit.id !== n.id ? hit : null;
  };

  const childrenOf = new Map<string, ProductIaNode[]>();
  const roots: ProductIaNode[] = [];
  for (const n of ia) {
    const parent = resolveParent(n);
    if (!parent) {
      roots.push(n);
      continue;
    }
    if (!childrenOf.has(parent.id)) childrenOf.set(parent.id, []);
    childrenOf.get(parent.id)!.push(n);
  }

  // Walk down from each root, guarding against a parentId cycle re-entering a node we've already
  // placed (it would otherwise recurse forever).
  const placed = new Set<string>();
  const walk = (n: ProductIaNode, depth: number): IaTreeNode => {
    placed.add(n.id);
    const kids = (childrenOf.get(n.id) ?? [])
      .filter((c) => !placed.has(c.id))
      .map((c) => walk(c, depth + 1));
    return { node: n, children: kids, depth };
  };

  const forest = roots.map((r) => walk(r, 0));

  // Any node a cycle kept from being placed still deserves a top-level seat.
  for (const n of ia) {
    if (!placed.has(n.id)) forest.push(walk(n, 0));
  }
  return forest;
}

// Flatten the forest into the visible rows, honoring which branches are collapsed. Pre-order so a
// parent always sits directly above its children, which is what the indent guides draw against.
function flatten(forest: IaTreeNode[], collapsed: Set<string>): IaTreeNode[] {
  const out: IaTreeNode[] = [];
  const visit = (n: IaTreeNode) => {
    out.push(n);
    if (collapsed.has(n.node.id)) return;
    for (const c of n.children) visit(c);
  };
  for (const r of forest) visit(r);
  return out;
}

export function IaLens({ model, selected, onSelect }: LensProps) {
  const forest = useMemo(() => buildForest(model.ia), [model.ia]);

  // Branches start expanded — the founder sees the whole shape, then folds away what they don't
  // need. Collapse is local view state, not a model edit.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const rows = useMemo(() => flatten(forest, collapsed), [forest, collapsed]);

  const total = model.ia.length;
  const guessCount = model.ia.filter((n) => n.provenance === "speculative").length;
  const citedCount = total - guessCount;

  // Things are referenced by id OR name in relatedThings — resolve to a display name either way.
  const thingNameByRef = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of model.things) {
      map.set(t.id, t.name || "Untitled");
      if (t.name) map.set(t.name.toLowerCase(), t.name);
    }
    return map;
  }, [model.things]);

  // The ia bag can be empty even when the rest of the picture exists (the shell only gates on
  // things). Say so plainly rather than rendering a blank frame.
  if (total === 0) {
    return (
      <div className="ia-empty" role="region" aria-label="Information architecture lens">
        <GitBranch className="ia-empty-icon" />
        <h3>No sitemap yet</h3>
        <p>
          This picture has objects but no information architecture — no areas or sections were
          derived. Redraw the picture, or add areas as you decide how the product is organized.
        </p>
      </div>
    );
  }

  return (
    <div className="ia-lens" role="region" aria-label="Information architecture lens">
      <div className="ia-tree" role="tree">
        {rows.map((row) => {
          const { node, depth, children } = row;
          const hasChildren = children.length > 0;
          const isCollapsed = collapsed.has(node.id);
          const related = node.relatedThings
            .map((r) => thingNameByRef.get(r) ?? thingNameByRef.get(r.toLowerCase()) ?? r)
            .filter(Boolean);

          return (
            <div
              key={node.id}
              className="ia-row"
              role="treeitem"
              aria-expanded={hasChildren ? !isCollapsed : undefined}
              aria-level={depth + 1}
              style={{ ["--ia-depth" as string]: depth }}
            >
              {/* Indent guides — one hairline rail per ancestor level, so deep nesting stays
                  readable as a tree rather than as floating cards. */}
              <div className="ia-indent" aria-hidden>
                {Array.from({ length: depth }).map((_, i) => (
                  <span key={i} className="ia-rail" />
                ))}
              </div>

              {/* Collapse toggle — only where there's something to fold. Leaf rows get a spacer so
                  every card's left edge lines up under its siblings. */}
              {hasChildren ? (
                <button
                  type="button"
                  className={cn("ia-toggle", !isCollapsed && "ia-toggle-open")}
                  onClick={() => toggle(node.id)}
                  aria-label={isCollapsed ? `Expand ${node.name}` : `Collapse ${node.name}`}
                  title={isCollapsed ? "Expand" : "Collapse"}
                >
                  <ChevronRight />
                </button>
              ) : (
                <span className="ia-toggle ia-toggle-leaf" aria-hidden />
              )}

              <ObjectCard
                kind="section"
                name={node.name}
                summary={node.summary}
                provenance={node.provenance}
                citationCount={node.evidence?.length ?? 0}
                selected={selected === node.id}
                onSelect={() => onSelect(node.id)}
                className="ia-card"
                headerExtra={
                  hasChildren ? (
                    <span className="ia-childcount" title="Sub-areas">
                      {children.length}
                    </span>
                  ) : undefined
                }
                footer={
                  related.length > 0 ? (
                    <div className="ia-surfaces" title="Objects this area puts in front of the user">
                      <CornerDownRight className="ia-surfaces-icon" />
                      <span className="ia-surfaces-label">surfaces</span>
                      <div className="ia-surfaces-list">
                        {related.map((name, i) => (
                          <span key={`${node.id}-rel-${i}`} className="ia-surface-chip">
                            {name}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : undefined
                }
              />
            </div>
          );
        })}
      </div>

      {/* Legend — what the tree is and how grounded it is. Docks to the bottom at ≤560px. */}
      <LensPanel title="Information architecture" className="ia-legend lens-panel-dock">
        <p className="ia-legend-note">
          How {model.things.length === 1 ? "the product" : "the product"} is organized — areas and
          sections, nested by parent, each showing the objects it surfaces.
        </p>
        <div className="ia-legend-counts">
          <span className="ia-legend-count ia-legend-cited">{citedCount} derived</span>
          {guessCount > 0 && (
            <span className="ia-legend-count ia-legend-guess">
              {guessCount} guess{guessCount === 1 ? "" : "es"}
            </span>
          )}
        </div>
      </LensPanel>
    </div>
  );
}
