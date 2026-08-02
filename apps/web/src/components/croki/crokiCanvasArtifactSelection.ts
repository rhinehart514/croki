/** Set-style equality prevents React Flow from echoing the same selection forever. */
export function sameNodeSelection(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id) => right.includes(id));
}
