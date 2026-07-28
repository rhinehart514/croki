import { post } from "./transport";

// A candidate intent the composer offers: `label` is the short clickable name, `direction` is the full,
// editable direction that loads into the composer when the founder picks it.
export type DirectionOption = { label: string; direction: string };
export type ComposerDirections = { options: DirectionOption[] };

// Deliberate intent-options assist. The founder summons candidate directions (a composer button); the server
// grounds them in project truth + open work and the composer's current context. Fails open to an empty set —
// the assist never blocks the composer or changes which SDK model receives the eventual prompt.
export const suggestDirections = (
  ventureId: string,
  body: { draft: string; mode: string; threadRef?: string | null },
) => post<ComposerDirections>(`/api/ventures/${encodeURIComponent(ventureId)}/composer/directions`, body);
