// Health → band color. A node's derived health reads the same number and color everywhere it
// appears — the canvas node badge, the Problems rail, and the node editor — so the figure is one
// shared truth. The bands match the danger / gap / proven semantic palette.
export function healthHex(health: number): string {
  if (health < 50) return "#dc2626"; // danger
  if (health < 70) return "#d97706"; // gap
  if (health < 85) return "#ca8a04"; // caution
  return "#16a34a"; // proven
}
