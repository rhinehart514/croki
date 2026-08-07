/**
 * Canonical text form used by persisted conversation search.
 *
 * NFC makes canonically equivalent input comparable, while the locale-neutral
 * Unicode lowercase mapping keeps persisted values stable across machines.
 */
export function normalizeThreadSearchText(value: string): string {
  return value.normalize("NFC").toLowerCase();
}
