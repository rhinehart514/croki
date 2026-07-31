export const CROKI_BRAND_CHANNELS = ["development", "alpha", "stable", "nightly"] as const;
export type CrokiBrandChannel = (typeof CROKI_BRAND_CHANNELS)[number];

export const CROKI_DESKTOP_PLATFORMS = ["mac", "linux", "win"] as const;
export type CrokiDesktopPlatform = (typeof CROKI_DESKTOP_PLATFORMS)[number];

export const CROKI_VISIBLE_BRAND = {
  baseName: "Croki",
  desktopArtifactName: "Croki-${version}-${arch}.${ext}",
  desktopDescription: "Croki desktop build",
  desktopPackageAuthor: "Croki",
  protocolDisplayName: "Croki",
} as const;

/**
 * Croki-owned identities that must never be shared with an installed T3 Code build.
 * Internal package and wire names can remain compatible without coupling app state.
 */
export const CROKI_PRODUCT_IDENTIFIERS = {
  stagedPackageName: "croki",
  desktopAppId: "com.croki.desktop",
  desktopDevelopmentAppId: "com.croki.desktop.dev",
  productionScheme: "croki",
  developmentScheme: "croki-dev",
  stateRoot: ".croki",
  productionStorageName: "Croki",
  developmentStorageName: "Croki (Dev)",
  productionDesktopEntryName: "croki.desktop",
  developmentDesktopEntryName: "croki-dev.desktop",
  productionWmClass: "croki",
  developmentWmClass: "croki-dev",
} as const;

export const CROKI_BRAND_ASSET_PATHS = {
  crokiIconPng: "assets/croki/croki-mark-1024.png",
  crokiWindowsIconIco: "assets/croki/croki-mark.ico",
  crokiWebFavicon16Png: "assets/croki/croki-mark-16.png",
  crokiWebFavicon32Png: "assets/croki/croki-mark-32.png",
  crokiWebAppleTouchIconPng: "assets/croki/croki-mark-180.png",
} as const;

export const RETAINED_T3_IDENTIFIERS = {
  stagedPackageName: "t3code",
  packageScope: "@t3tools/",
  desktopAppId: "com.t3tools.t3code",
  desktopDevelopmentAppId: "com.t3tools.t3code.dev",
  productionScheme: "t3code",
  developmentScheme: "t3code-dev",
  previewScheme: "t3code-preview",
  stateRoot: ".t3",
  productionStorageName: "t3code",
  developmentStorageName: "t3code-dev",
  storageKeyPrefix: "t3code:",
  productionDesktopEntryName: "t3code.desktop",
  developmentDesktopEntryName: "t3code-dev.desktop",
  environmentPrefix: "T3CODE_",
  desktopIpcPrefix: "desktop:",
  telemetryPrefix: "t3.",
  embeddedCommitHashKey: "t3codeCommitHash",
  projectConfigFileName: "t3.json",
  productMcpName: "t3-code",
  resourceMonitorExecutableName: "t3-resource-monitor",
  hostedServiceDomainSuffix: "t3.codes",
} as const;

/**
 * Compatibility and migration identifiers inherited from T3 Code.
 *
 * Croki-owned app identity is defined separately above. These legacy values
 * remain available where wire compatibility or one-time migration still needs
 * to recognize T3 Code. Release gates consume the list when distinguishing
 * intentional compatibility references from accidental visible branding.
 */
export const RETAINED_T3_IDENTIFIER_ALLOWLIST = [
  {
    category: "package",
    match: "exact",
    value: RETAINED_T3_IDENTIFIERS.stagedPackageName,
    reason: "Staged package and executable identity",
  },
  {
    category: "executable",
    match: "exact",
    value: RETAINED_T3_IDENTIFIERS.stagedPackageName,
    reason: "Desktop launcher executable identity",
  },
  {
    category: "package",
    match: "prefix",
    value: RETAINED_T3_IDENTIFIERS.packageScope,
    reason: "Published and workspace package scope",
  },
  {
    category: "app-id",
    match: "prefix",
    value: RETAINED_T3_IDENTIFIERS.desktopAppId,
    reason: "Legacy installed-app identity recognized for migration and mobile compatibility",
  },
  {
    category: "url-scheme",
    match: "exact",
    value: RETAINED_T3_IDENTIFIERS.productionScheme,
    reason: "Legacy production deep links recognized for compatibility",
  },
  {
    category: "url-scheme",
    match: "exact",
    value: RETAINED_T3_IDENTIFIERS.developmentScheme,
    reason: "Legacy development deep links recognized for compatibility",
  },
  {
    category: "url-scheme",
    match: "exact",
    value: RETAINED_T3_IDENTIFIERS.previewScheme,
    reason: "Mobile preview deep links",
  },
  {
    category: "storage",
    match: "exact",
    value: RETAINED_T3_IDENTIFIERS.stateRoot,
    reason: "Legacy state root recognized as migration input",
  },
  {
    category: "storage",
    match: "exact",
    value: RETAINED_T3_IDENTIFIERS.productionStorageName,
    reason: "Legacy production user-data directory recognized as migration input",
  },
  {
    category: "storage",
    match: "exact",
    value: RETAINED_T3_IDENTIFIERS.developmentStorageName,
    reason: "Legacy development user-data directory recognized as migration input",
  },
  {
    category: "storage",
    match: "prefix",
    value: RETAINED_T3_IDENTIFIERS.storageKeyPrefix,
    reason: "Persisted browser and renderer state",
  },
  {
    category: "desktop-entry",
    match: "exact",
    value: RETAINED_T3_IDENTIFIERS.productionDesktopEntryName,
    reason: "Production Linux desktop integration",
  },
  {
    category: "desktop-entry",
    match: "exact",
    value: RETAINED_T3_IDENTIFIERS.developmentDesktopEntryName,
    reason: "Development Linux desktop integration",
  },
  {
    category: "environment",
    match: "prefix",
    value: RETAINED_T3_IDENTIFIERS.environmentPrefix,
    reason: "Existing CLI and deployment configuration",
  },
  {
    category: "wire",
    match: "prefix",
    value: RETAINED_T3_IDENTIFIERS.desktopIpcPrefix,
    reason: "Desktop IPC channel namespace",
  },
  {
    category: "telemetry",
    match: "prefix",
    value: RETAINED_T3_IDENTIFIERS.telemetryPrefix,
    reason: "Existing telemetry attribute namespace",
  },
  {
    category: "package-metadata",
    match: "exact",
    value: RETAINED_T3_IDENTIFIERS.embeddedCommitHashKey,
    reason: "Packaged commit metadata read by existing desktop clients",
  },
  {
    category: "project-contract",
    match: "exact",
    value: RETAINED_T3_IDENTIFIERS.projectConfigFileName,
    reason: "Repository-owned project configuration file",
  },
  {
    category: "provider-wire",
    match: "exact",
    value: RETAINED_T3_IDENTIFIERS.productMcpName,
    reason: "Provider MCP server and client identity",
  },
  {
    category: "executable",
    match: "prefix",
    value: RETAINED_T3_IDENTIFIERS.resourceMonitorExecutableName,
    reason: "Bundled resource-monitor executable and lookup contract",
  },
  {
    category: "service",
    match: "suffix",
    value: RETAINED_T3_IDENTIFIERS.hostedServiceDomainSuffix,
    reason: "Existing hosted app, auth, schema, and legal endpoints",
  },
] as const;

const CHANNEL_STAGE_LABELS: Record<CrokiBrandChannel, string | null> = {
  development: "Dev",
  alpha: "Alpha",
  stable: null,
  nightly: "Nightly",
};

export interface CrokiDesktopBrandMetadata {
  readonly platform: CrokiDesktopPlatform;
  readonly channel: CrokiBrandChannel;
  readonly baseName: typeof CROKI_VISIBLE_BRAND.baseName;
  readonly displayName: string;
  readonly stageLabel: string | null;
  readonly artifactName: typeof CROKI_VISIBLE_BRAND.desktopArtifactName;
  readonly description: typeof CROKI_VISIBLE_BRAND.desktopDescription;
  readonly author: typeof CROKI_VISIBLE_BRAND.desktopPackageAuthor;
  readonly protocolDisplayName: typeof CROKI_VISIBLE_BRAND.protocolDisplayName;
  readonly icons: {
    readonly application: typeof CROKI_BRAND_ASSET_PATHS.crokiIconPng;
    readonly windows: typeof CROKI_BRAND_ASSET_PATHS.crokiWindowsIconIco;
  };
}

export function resolveCrokiDesktopBrandMetadata(input: {
  readonly platform: CrokiDesktopPlatform;
  readonly channel: CrokiBrandChannel;
}): CrokiDesktopBrandMetadata {
  const stageLabel = CHANNEL_STAGE_LABELS[input.channel];
  return {
    platform: input.platform,
    channel: input.channel,
    baseName: CROKI_VISIBLE_BRAND.baseName,
    displayName:
      stageLabel === null
        ? CROKI_VISIBLE_BRAND.baseName
        : `${CROKI_VISIBLE_BRAND.baseName} (${stageLabel})`,
    stageLabel,
    artifactName: CROKI_VISIBLE_BRAND.desktopArtifactName,
    description: CROKI_VISIBLE_BRAND.desktopDescription,
    author: CROKI_VISIBLE_BRAND.desktopPackageAuthor,
    protocolDisplayName: CROKI_VISIBLE_BRAND.protocolDisplayName,
    icons: {
      application: CROKI_BRAND_ASSET_PATHS.crokiIconPng,
      windows: CROKI_BRAND_ASSET_PATHS.crokiWindowsIconIco,
    },
  };
}

export function resolveCrokiDesktopBrandChannel(input: {
  readonly version: string;
  readonly fallbackProductName: string;
}): CrokiBrandChannel {
  if (/-nightly\.\d{8}\.\d+$/u.test(input.version)) {
    return "nightly";
  }
  if (/\(\s*alpha\s*\)$/iu.test(input.fallbackProductName)) {
    return "alpha";
  }
  return "stable";
}
