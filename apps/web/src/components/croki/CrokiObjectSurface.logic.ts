import { CROKI_APPLICATION_LEGACY_RELATIVE_PATH } from "@croki/shared/crokiApplication";
import { parseCrokiScopeObject, type CrokiScopeObject } from "@croki/shared/crokiScopes";

export type CrokiVisualObject = CrokiScopeObject | { readonly kind: "invalid" };

export function isCrokiObjectPath(relativePath: string | null): boolean {
  return (
    relativePath?.toLowerCase().endsWith(".croki") ||
    relativePath === CROKI_APPLICATION_LEGACY_RELATIVE_PATH
  );
}

export function parseCrokiVisualObject(contents: string): CrokiVisualObject {
  try {
    return parseCrokiScopeObject(contents);
  } catch {
    return { kind: "invalid" };
  }
}
