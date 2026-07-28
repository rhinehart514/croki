export const COMPOSER_SOURCE_REFERENCE_EVENT = "drover:composer-source-reference";
export const OPEN_COMPOSER_SOURCE_EVENT = "drover:open-composer-source";

export type ComposerSourceReference = {
  scopeKey: string;
  path: string;
  startLine: number;
  endLine: number;
  ref: string;
};

export function addComposerSourceReference(reference: ComposerSourceReference) {
  window.dispatchEvent(new CustomEvent<ComposerSourceReference>(
    COMPOSER_SOURCE_REFERENCE_EVENT,
    { detail: reference },
  ));
}

export function openComposerSourceReference(reference: ComposerSourceReference) {
  window.dispatchEvent(new CustomEvent<ComposerSourceReference>(
    OPEN_COMPOSER_SOURCE_EVENT,
    { detail: reference },
  ));
}
