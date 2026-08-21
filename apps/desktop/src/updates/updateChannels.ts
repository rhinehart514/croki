import type { DesktopUpdateChannel } from "@croki/contracts";

const NIGHTLY_VERSION_PATTERN = /-nightly\.\d{8}\.\d+$/;
const CROKI_UPDATE_OWNER = "rhinehart514";
const CROKI_STABLE_UPDATE_REPOSITORY = "croki";
const CROKI_NIGHTLY_UPDATE_REPOSITORY = "croki-releases";

export interface DesktopGitHubUpdateFeed {
  readonly provider: "github";
  readonly owner: string;
  readonly repo: string;
  readonly releaseType: "release" | "prerelease";
  readonly channel?: "nightly";
}

export function isNightlyDesktopVersion(version: string): boolean {
  return NIGHTLY_VERSION_PATTERN.test(version);
}

export function resolveDefaultDesktopUpdateChannel(appVersion: string): DesktopUpdateChannel {
  return isNightlyDesktopVersion(appVersion) ? "nightly" : "latest";
}

/**
 * Official stable and nightly binaries intentionally publish to separate repositories.
 * Keep custom/fork feeds in their configured repository while making Croki's in-app
 * update-track switch change both the channel manifest and the repository it lives in.
 */
export function resolveDesktopGitHubUpdateFeed(
  config: Readonly<Record<string, string>>,
  channel: DesktopUpdateChannel,
): DesktopGitHubUpdateFeed | null {
  if (config.provider !== "github" || !config.owner || !config.repo) {
    return null;
  }

  const isOfficialCrokiFeed =
    config.owner === CROKI_UPDATE_OWNER &&
    (config.repo === CROKI_STABLE_UPDATE_REPOSITORY ||
      config.repo === CROKI_NIGHTLY_UPDATE_REPOSITORY);
  const repo = isOfficialCrokiFeed
    ? channel === "nightly"
      ? CROKI_NIGHTLY_UPDATE_REPOSITORY
      : CROKI_STABLE_UPDATE_REPOSITORY
    : config.repo;

  return {
    provider: "github",
    owner: config.owner,
    repo,
    releaseType: channel === "nightly" ? "prerelease" : "release",
    ...(channel === "nightly" ? { channel: "nightly" as const } : {}),
  };
}
