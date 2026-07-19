import type { WorkIndex, WorkIndexOutlineObject } from "@/api";
import type { Direction } from "@/components/now/directionModel";

export type OutlineObjectNode = WorkIndexOutlineObject & {
  thoughts: Direction[];
  children: OutlineObjectNode[];
};

export type OutlineSection = {
  id: string;
  label: string;
  objects: OutlineObjectNode[];
  thoughtCount: number;
};

export type OutlineTerritory = {
  id: "product" | "gtm" | "context";
  label: string;
  sections: OutlineSection[];
  thoughtCount: number;
};

export type VentureOutline = { territories: OutlineTerritory[] };

const SECTION_LABELS: Record<string, string> = {
  direction: "Direction",
  experiences: "Experiences",
  capabilities: "Capabilities",
  systems: "Systems",
  "design-system": "Design system",
  releases: "Releases",
  "product-evidence": "Product evidence",
  market: "Market",
  audiences: "Audiences",
  positioning: "Positioning",
  offer: "Offer",
  distribution: "Distribution",
  campaigns: "Launches",
  "market-evidence": "Market evidence",
  other: "Other",
  "venture-context": "Objects",
  "unplaced-thoughts": "Unplaced thoughts",
};

function labelFor(sectionId: string) {
  return SECTION_LABELS[sectionId] ?? sectionId.replace(/-/g, " ").replace(/^./, (value) => value.toUpperCase());
}

function hasAttention(direction: Direction) {
  return direction.needsYou || direction.state === "needs-you";
}

function matchesDirection(direction: Direction, query: string) {
  return `${direction.sentence} ${direction.understanding}`.toLowerCase().includes(query);
}

function buildTree(objects: WorkIndexOutlineObject[], directions: Map<string, Direction>, query: string, needsOnly: boolean) {
  const nodes = new Map<string, OutlineObjectNode>(objects.map((object): [string, OutlineObjectNode] => [object.id, {
    ...object,
    thoughts: object.threadRefs.map((ref) => directions.get(ref)).filter((item): item is Direction => Boolean(item)),
    children: [],
  }]));
  const roots: OutlineObjectNode[] = [];
  for (const node of nodes.values()) {
    const parentId = node.parentRef?.replace(/^(?:object|architecture):/, "");
    const parent = parentId ? nodes.get(parentId) : null;
    if (parent && parent.territory === node.territory && parent.sectionId === node.sectionId) parent.children.push(node);
    else roots.push(node);
  }

  const filterNode = (node: OutlineObjectNode): OutlineObjectNode | null => {
    const objectMatch = query && `${node.name} ${node.statement} ${node.type}`.toLowerCase().includes(query);
    const thoughts = node.thoughts.filter((thought) => (
      (!needsOnly || hasAttention(thought)) && (!query || objectMatch || matchesDirection(thought, query))
    ));
    const children = node.children.map(filterNode).filter((child): child is OutlineObjectNode => Boolean(child));
    if (needsOnly && !thoughts.length && !children.length) return null;
    if (query && !objectMatch && !thoughts.length && !children.length) return null;
    return { ...node, thoughts, children };
  };
  return roots.map(filterNode).filter((node): node is OutlineObjectNode => Boolean(node));
}

function countThoughts(nodes: OutlineObjectNode[]): number {
  return nodes.reduce((sum, node) => sum + node.thoughts.length + countThoughts(node.children), 0);
}

export function buildVentureOutline(
  workIndex: WorkIndex | null,
  directions: Direction[],
  { search = "", needsOnly = false } = {},
): VentureOutline {
  const query = search.trim().toLowerCase();
  const directionsByRef = new Map(directions.map((direction) => [direction.id, direction]));
  const objects = workIndex?.outline?.objects ?? [];
  const territories: OutlineTerritory[] = ([
    ["product", "Product"],
    ["gtm", "Go-to-market"],
  ] as const).map(([id, label]) => {
    const sectionIds = [...new Set(objects.filter((object) => object.territory === id).map((object) => object.sectionId))];
    const sections = sectionIds.map((sectionId) => {
      const sectionObjects = objects.filter((object) => object.territory === id && object.sectionId === sectionId);
      const tree = buildTree(sectionObjects, directionsByRef, query, needsOnly);
      return { id: sectionId, label: labelFor(sectionId), objects: tree, thoughtCount: countThoughts(tree) };
    }).filter((section) => section.objects.length > 0);
    return { id, label, sections, thoughtCount: sections.reduce((sum, section) => sum + section.thoughtCount, 0) };
  });

  const contextObjects = objects.filter((object) => object.territory == null);
  const contextTree = buildTree(contextObjects, directionsByRef, query, needsOnly);
  const placed = new Set(objects.flatMap((object) => object.threadRefs));
  const unplacedRefs = workIndex?.outline?.unplacedThreadRefs ?? directions.filter((direction) => !placed.has(direction.id)).map((direction) => direction.id);
  const unplaced = unplacedRefs.map((ref) => directionsByRef.get(ref)).filter((item): item is Direction => Boolean(item))
    .filter((direction) => (!needsOnly || hasAttention(direction)) && (!query || matchesDirection(direction, query)));
  const contextSections: OutlineSection[] = [];
  if (contextTree.length) contextSections.push({ id: "venture-context", label: "Objects", objects: contextTree, thoughtCount: countThoughts(contextTree) });
  if (unplaced.length) {
    contextSections.push({
      id: "unplaced-thoughts",
      label: "Unplaced thoughts",
      objects: [{
        id: "unplaced-thoughts", objectRef: "", name: "Unplaced thoughts", statement: "",
        type: "thread-group", territory: null, sectionId: "unplaced-thoughts", parentRef: null,
        assertion: "tentative", provenance: null, threadRefs: unplaced.map((item) => item.id), targetable: false,
        architectureRole: null, details: {}, updatedAt: null, thoughts: unplaced, children: [],
      }],
      thoughtCount: unplaced.length,
    });
  }
  if (contextSections.length) territories.push({
    id: "context", label: "Venture context", sections: contextSections,
    thoughtCount: contextSections.reduce((sum, section) => sum + section.thoughtCount, 0),
  });
  return { territories };
}
