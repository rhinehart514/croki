import { post } from "./transport";

// A candidate intent the composer offers: `label` is the short clickable name, `direction` is the full,
// editable direction that loads into the composer when the founder picks it.
export type DirectionOption = { label: string; direction: string };
export type ComposerDirections = { options: DirectionOption[] };

// Deliberate intent-options assist. The founder summons candidate directions (a composer button); the server
// grounds them in the venture's truth + open work and the composer's submission `mode` (build vs. Product/GTM
// vs. plain direction). Fails open to an empty set — the assist never blocks the composer.
export const suggestDirections = (
  ventureId: string,
  body: { draft: string; mode: string; threadRef?: string | null },
) => post<ComposerDirections>(`/api/ventures/${encodeURIComponent(ventureId)}/composer/directions`, body);
