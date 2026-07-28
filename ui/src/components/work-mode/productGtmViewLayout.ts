import type { ProductGtmViewEdge, ProductGtmViewNode } from "./productGtmView";

export type ProductGtmViewPoint = { x: number; y: number };

const COLUMN_GAP = 304;
const ROW_GAP = 84;
const EXPANDED_SPACE = 116;

function mean(values: number[]) {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : Number.POSITIVE_INFINITY;
}

export function productGtmTopologyLayout(
  nodes: ProductGtmViewNode[],
  edges: ProductGtmViewEdge[],
  selectedId: string | null = null,
): Map<string, ProductGtmViewPoint> {
  const known = new Set(nodes.map((node) => node.id));
  const sourceIndex = new Map(nodes.map((node, index) => [node.id, index]));
  const outgoing = new Map(nodes.map((node) => [node.id, [] as string[]]));
  const incoming = new Map(nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of edges) {
    if (!known.has(edge.from) || !known.has(edge.to) || edge.from === edge.to) continue;
    outgoing.get(edge.from)?.push(edge.to);
    incoming.get(edge.to)?.push(edge.from);
  }

  const indegree = new Map(nodes.map((node) => [node.id, incoming.get(node.id)?.length ?? 0]));
  const queue = nodes.filter((node) => indegree.get(node.id) === 0).map((node) => node.id);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const target of outgoing.get(id) ?? []) {
      const remaining = (indegree.get(target) ?? 1) - 1;
      indegree.set(target, remaining);
      if (remaining === 0) queue.push(target);
    }
  }
  for (const node of nodes) if (!order.includes(node.id)) order.push(node.id);

  const rank = new Map(nodes.map((node) => [node.id, 0]));
  for (let pass = 0; pass < nodes.length; pass += 1) {
    let changed = false;
    for (const source of order) {
      for (const target of outgoing.get(source) ?? []) {
        const next = Math.min(nodes.length - 1, (rank.get(source) ?? 0) + 1);
        if (next > (rank.get(target) ?? 0)) {
          rank.set(target, next);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }

  // Smaller disconnected reads are supporting context, not competing entry points. Right-align each
  // secondary component with the main topology so an isolated unknown → action branch lands beside
  // the consequence it informs instead of appearing to begin the whole product.
  const undirected = new Map(nodes.map((node) => [node.id, new Set<string>()]));
  for (const [source, targets] of outgoing) for (const target of targets) {
    undirected.get(source)?.add(target);
    undirected.get(target)?.add(source);
  }
  const unseen = new Set(nodes.map((node) => node.id));
  const components: string[][] = [];
  while (unseen.size) {
    const pending = [unseen.values().next().value as string];
    const component: string[] = [];
    while (pending.length) {
      const id = pending.pop()!;
      if (!unseen.delete(id)) continue;
      component.push(id);
      pending.push(...(undirected.get(id) ?? []));
    }
    components.push(component);
  }
  const main = [...components].sort((left, right) => right.length - left.length)[0] ?? [];
  const mainMax = Math.max(0, ...main.map((id) => rank.get(id) ?? 0));
  for (const component of components) {
    if (component === main) continue;
    const componentMax = Math.max(0, ...component.map((id) => rank.get(id) ?? 0));
    const shift = Math.max(0, mainMax - componentMax);
    for (const id of component) rank.set(id, (rank.get(id) ?? 0) + shift);
  }

  const columns = new Map<number, string[]>();
  for (const node of nodes) {
    const column = rank.get(node.id) ?? 0;
    columns.set(column, [...(columns.get(column) ?? []), node.id]);
  }

  const rowById = new Map<string, number>();
  for (const column of [...columns.keys()].sort((a, b) => a - b)) {
    const group = columns.get(column) ?? [];
    group.sort((left, right) => {
      const leftParents = (incoming.get(left) ?? []).map((id) => rowById.get(id)).filter((value): value is number => value !== undefined);
      const rightParents = (incoming.get(right) ?? []).map((id) => rowById.get(id)).filter((value): value is number => value !== undefined);
      return mean(leftParents) - mean(rightParents) || (sourceIndex.get(left) ?? 0) - (sourceIndex.get(right) ?? 0);
    });
    group.forEach((id, index) => rowById.set(id, index));
  }

  const columnHeight = (group: string[]) => Math.max(0, (group.length - 1) * ROW_GAP)
    + (selectedId && group.includes(selectedId) ? EXPANDED_SPACE : 0);
  const maxHeight = Math.max(0, ...[...columns.values()].map(columnHeight));
  const positions = new Map<string, ProductGtmViewPoint>();
  for (const [column, group] of columns) {
    let y = (maxHeight - columnHeight(group)) / 2;
    for (const id of group) {
      positions.set(id, { x: column * COLUMN_GAP, y });
      y += ROW_GAP + (id === selectedId ? EXPANDED_SPACE : 0);
    }
  }
  return positions;
}
