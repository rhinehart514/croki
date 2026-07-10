// composerCollapse — the pure decision for whether the docked composer starts as the SLIM perimeter rail
// (docs/production-direction/16, P0). Kept out of the component file so it is unit-testable and does not
// break Fast Refresh.
//
// The rule: an explicit cold-landing open (startOpen) always wins. Otherwise the composer rests collapsed
// when the founder is surveying at product altitude (preferCollapsed) — even with a live session, so the
// operation owns the canvas and the running/gate state shows in the slim rail — or when it is floating, or
// has no session, or the session is terminal. At action altitude (preferCollapsed false) a live session
// opens the composer as before.
export function composerStartsCollapsed(input: {
  startOpen: boolean;
  preferCollapsed: boolean;
  floating: boolean;
  hasSession: boolean;
  terminal: boolean;
}): boolean {
  if (input.startOpen) return false;
  return input.preferCollapsed || input.floating || !input.hasSession || input.terminal;
}
