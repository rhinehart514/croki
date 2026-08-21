import * as Option from "effect/Option";

export type JoinPath = (first: string, ...segments: string[]) => string;

function normalizeConfiguredBaseDir(configuredHome: Option.Option<string>): Option.Option<string> {
  if (Option.isNone(configuredHome)) {
    return Option.none();
  }
  const trimmed = configuredHome.value.trim();
  return trimmed.length > 0 ? Option.some(trimmed) : Option.none();
}

export function resolveDesktopBaseDir(input: {
  readonly homeDirectory: string;
  readonly joinPath: JoinPath;
  readonly configuredHome: Option.Option<string>;
  readonly defaultStateRoot: string;
}): string {
  return Option.getOrElse(normalizeConfiguredBaseDir(input.configuredHome), () =>
    input.joinPath(input.homeDirectory, input.defaultStateRoot),
  );
}

export function resolveDesktopStateDir(input: {
  readonly baseDir: string;
  readonly isDevelopment: boolean;
  readonly joinPath: JoinPath;
  readonly configuredHome: Option.Option<string>;
}): string {
  const useDevSubdir =
    input.isDevelopment && Option.isNone(normalizeConfiguredBaseDir(input.configuredHome));
  return input.joinPath(input.baseDir, useDevSubdir ? "dev" : "userdata");
}
