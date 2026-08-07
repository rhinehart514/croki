// @effect-diagnostics nodeBuiltinImport:off
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import { LEGACY_PRODUCT_IDENTIFIERS } from "./lib/brand-policy.ts";

export type CrokiReleaseDestinationStatus = "enabled" | "disabled" | "unconfigured" | "invalid";

interface DestinationBase {
  readonly status: CrokiReleaseDestinationStatus;
  readonly enabled: boolean;
  readonly missing: readonly string[];
  readonly errors: readonly string[];
}

export interface CrokiReleasePlan {
  readonly version: 1;
  readonly mode: "plan" | "production";
  readonly status: "enabled" | "disabled" | "invalid";
  readonly enabled: boolean;
  readonly valid: boolean;
  readonly destinations: {
    readonly github: DestinationBase & {
      readonly repository: string | null;
      readonly branch: string | null;
      readonly releaseAppIdConfigured: boolean;
      readonly releaseAppPrivateKeyConfigured: boolean;
    };
    readonly cli: DestinationBase & {
      readonly packageName: string | null;
    };
    readonly relay: DestinationBase & {
      readonly domain: string | null;
    };
    readonly web: DestinationBase & {
      readonly vercelOrgId: string | null;
      readonly vercelProjectId: string | null;
      readonly vercelTeamSlug: string | null;
      readonly routerUrl: string | null;
      readonly latestDomain: string | null;
      readonly nightlyDomain: string | null;
    };
    readonly signing: DestinationBase & {
      readonly appleTeamId: string | null;
      readonly macosCredentialsConfigured: boolean;
      readonly windowsCredentialsConfigured: boolean;
    };
    readonly discord: DestinationBase & {
      readonly webhookConfigured: boolean;
      readonly latestRoleConfigured: boolean;
      readonly nightlyRoleConfigured: boolean;
    };
    readonly mobile: DestinationBase & {
      readonly productionRequested: boolean;
      readonly previewRequested: boolean;
      readonly easProjectId: string | null;
      readonly expoTokenConfigured: boolean;
    };
  };
  readonly errors: readonly string[];
}

type ReleaseEnvironment = Readonly<Record<string, string | undefined>>;

// These are the predecessor's publication identities. Keep them explicit: the
// current Croki repository and package are intentionally named `croki` and
// must remain valid release destinations.
const INHERITED_T3_REPOSITORY = LEGACY_PRODUCT_IDENTIFIERS.predecessorRepository;
const INHERITED_T3_CLI_PACKAGE = LEGACY_PRODUCT_IDENTIFIERS.predecessorPackageName;
const INHERITED_T3_CLI_PACKAGE_SCOPE = LEGACY_PRODUCT_IDENTIFIERS.predecessorPackageScope;
const INHERITED_T3_EAS_PROJECT_ID = "d763fcb8-d37c-41ea-a773-b54a0ab4a454";
const INHERITED_T3_DOMAIN_SUFFIX = "t3.codes";

const value = (environment: ReleaseEnvironment, name: string): string | null => {
  const resolved = environment[name]?.trim();
  return resolved ? resolved : null;
};

const enabled = (environment: ReleaseEnvironment, name: string): boolean =>
  value(environment, name) === "true";

const allConfigured = (environment: ReleaseEnvironment, names: readonly string[]): boolean =>
  names.every((name) => value(environment, name) !== null);

function destinationBase(input: {
  readonly requested: boolean;
  readonly missing: readonly string[];
  readonly errors: readonly string[];
}): DestinationBase {
  const status: CrokiReleaseDestinationStatus = !input.requested
    ? "disabled"
    : input.errors.length > 0
      ? "invalid"
      : input.missing.length > 0
        ? "unconfigured"
        : "enabled";
  return {
    status,
    enabled: status === "enabled",
    missing: input.requested ? input.missing : [],
    errors: input.requested ? input.errors : [],
  };
}

function missingValues(
  requested: boolean,
  entries: ReadonlyArray<readonly [name: string, configured: boolean]>,
): string[] {
  return requested ? entries.filter(([, configured]) => !configured).map(([name]) => name) : [];
}

function inheritedDomainError(name: string, destination: string | null): string[] {
  return destination?.toLowerCase().includes(INHERITED_T3_DOMAIN_SUFFIX)
    ? [`${name} must not target the inherited T3 domain.`]
    : [];
}

export function buildCrokiReleasePlan(
  environment: ReleaseEnvironment,
  options: { readonly production?: boolean } = {},
): CrokiReleasePlan {
  // Destinations are opt-in independently except for update-capable clients.
  // A desktop, hosted web, or production mobile release can only ship after
  // the matching exact-version croki-server package is enabled for publication.
  // Mobile previews verify the already-published exact version in their workflow.
  const releaseRequested = enabled(environment, "CROKI_RELEASE_ENABLED");
  const cliRequested = enabled(environment, "CROKI_CLI_PUBLISH_ENABLED");
  const relayRequested = enabled(environment, "CROKI_RELAY_DEPLOY_ENABLED");
  const webRequested = enabled(environment, "CROKI_WEB_DEPLOY_ENABLED");
  const signingRequested = enabled(environment, "CROKI_SIGNING_ENABLED");
  const discordRequested = enabled(environment, "CROKI_DISCORD_RELEASE_ENABLED");
  const mobileProductionRequested = enabled(environment, "CROKI_MOBILE_DEPLOY_ENABLED");
  const mobilePreviewRequested = enabled(environment, "CROKI_MOBILE_PREVIEW_ENABLED");
  const mobileRequested = mobileProductionRequested || mobilePreviewRequested;

  const repository = value(environment, "CROKI_RELEASE_REPOSITORY");
  const branch = value(environment, "CROKI_RELEASE_BRANCH");
  const releaseAppIdConfigured = value(environment, "CROKI_RELEASE_APP_ID") !== null;
  const releaseAppPrivateKeyConfigured =
    value(environment, "CROKI_RELEASE_APP_PRIVATE_KEY") !== null;
  const githubErrors = [
    ...(repository?.toLowerCase() === INHERITED_T3_REPOSITORY
      ? ["CROKI_RELEASE_REPOSITORY must not target the inherited repository."]
      : []),
    ...(branch?.toLowerCase() === "main"
      ? ["CROKI_RELEASE_BRANCH must not enable release pushes to main."]
      : []),
  ];
  const github = {
    ...destinationBase({
      requested: releaseRequested || relayRequested || mobileRequested,
      missing: missingValues(releaseRequested || relayRequested || mobileRequested, [
        ["CROKI_RELEASE_REPOSITORY", repository !== null],
        ["CROKI_RELEASE_BRANCH", branch !== null],
      ]),
      errors: githubErrors,
    }),
    repository,
    branch,
    releaseAppIdConfigured,
    releaseAppPrivateKeyConfigured,
  };

  const packageName = value(environment, "CROKI_CLI_PACKAGE");
  const cliErrors = [
    ...(packageName === INHERITED_T3_CLI_PACKAGE ||
    packageName?.startsWith(INHERITED_T3_CLI_PACKAGE_SCOPE) === true
      ? ["CROKI_CLI_PACKAGE must not target an inherited T3 package."]
      : []),
    ...(cliRequested && packageName !== null && packageName !== "croki-server"
      ? ["CROKI_CLI_PACKAGE must be the Croki-owned croki-server package."]
      : []),
  ];
  const cli = {
    ...destinationBase({
      requested: cliRequested,
      missing: missingValues(cliRequested, [["CROKI_CLI_PACKAGE", packageName !== null]]),
      errors: cliErrors,
    }),
    packageName,
  };

  const relayDomain = value(environment, "CROKI_RELAY_DOMAIN");
  const relay = {
    ...destinationBase({
      requested: relayRequested,
      missing: missingValues(relayRequested, [["CROKI_RELAY_DOMAIN", relayDomain !== null]]),
      errors: inheritedDomainError("CROKI_RELAY_DOMAIN", relayDomain),
    }),
    domain: relayDomain,
  };

  const vercelOrgId = value(environment, "CROKI_VERCEL_ORG_ID");
  const vercelProjectId = value(environment, "CROKI_VERCEL_PROJECT_ID");
  const vercelTeamSlug = value(environment, "CROKI_VERCEL_TEAM_SLUG");
  const routerUrl = value(environment, "CROKI_WEB_ROUTER_URL");
  const latestDomain = value(environment, "CROKI_WEB_LATEST_DOMAIN");
  const nightlyDomain = value(environment, "CROKI_WEB_NIGHTLY_DOMAIN");
  const web = {
    ...destinationBase({
      requested: webRequested,
      missing: missingValues(webRequested, [
        ["CROKI_VERCEL_ORG_ID", vercelOrgId !== null],
        ["CROKI_VERCEL_PROJECT_ID", vercelProjectId !== null],
        ["CROKI_WEB_ROUTER_URL", routerUrl !== null],
        ["CROKI_WEB_LATEST_DOMAIN", latestDomain !== null],
        ["CROKI_WEB_NIGHTLY_DOMAIN", nightlyDomain !== null],
      ]),
      errors: [
        ...inheritedDomainError("CROKI_WEB_ROUTER_URL", routerUrl),
        ...inheritedDomainError("CROKI_WEB_LATEST_DOMAIN", latestDomain),
        ...inheritedDomainError("CROKI_WEB_NIGHTLY_DOMAIN", nightlyDomain),
      ],
    }),
    vercelOrgId,
    vercelProjectId,
    vercelTeamSlug,
    routerUrl,
    latestDomain,
    nightlyDomain,
  };

  const appleTeamId = value(environment, "CROKI_APPLE_TEAM_ID");
  const macosCredentialNames = [
    "CROKI_MACOS_CERTIFICATE",
    "CROKI_MACOS_CERTIFICATE_PASSWORD",
    "CROKI_APPLE_API_KEY",
    "CROKI_APPLE_API_KEY_ID",
    "CROKI_APPLE_API_ISSUER",
    "CROKI_APPLE_TEAM_ID",
    "CROKI_MACOS_PROVISIONING_PROFILE",
  ] as const;
  const windowsCredentialNames = [
    "CROKI_AZURE_TENANT_ID",
    "CROKI_AZURE_CLIENT_ID",
    "CROKI_AZURE_CLIENT_SECRET",
    "CROKI_AZURE_TRUSTED_SIGNING_ENDPOINT",
    "CROKI_AZURE_TRUSTED_SIGNING_ACCOUNT_NAME",
    "CROKI_AZURE_TRUSTED_SIGNING_CERTIFICATE_PROFILE_NAME",
    "CROKI_AZURE_TRUSTED_SIGNING_PUBLISHER_NAME",
  ] as const;
  const macosCredentialsConfigured = allConfigured(environment, macosCredentialNames);
  const windowsCredentialsConfigured = allConfigured(environment, windowsCredentialNames);
  const signing = {
    ...destinationBase({
      requested: signingRequested,
      missing: missingValues(signingRequested, [
        ["Croki macOS signing credentials", macosCredentialsConfigured],
        ["Croki Windows signing credentials", windowsCredentialsConfigured],
      ]),
      errors: [],
    }),
    appleTeamId,
    macosCredentialsConfigured,
    windowsCredentialsConfigured,
  };

  const webhookConfigured = value(environment, "CROKI_DISCORD_RELEASE_WEBHOOK_URL") !== null;
  const latestRoleConfigured = value(environment, "CROKI_DISCORD_RELEASE_LATEST_ROLE_ID") !== null;
  const nightlyRoleConfigured =
    value(environment, "CROKI_DISCORD_RELEASE_NIGHTLY_ROLE_ID") !== null;
  const discord = {
    ...destinationBase({
      requested: discordRequested,
      missing: missingValues(discordRequested, [
        ["CROKI_DISCORD_RELEASE_WEBHOOK_URL", webhookConfigured],
        ["CROKI_DISCORD_RELEASE_LATEST_ROLE_ID", latestRoleConfigured],
        ["CROKI_DISCORD_RELEASE_NIGHTLY_ROLE_ID", nightlyRoleConfigured],
      ]),
      errors: [],
    }),
    webhookConfigured,
    latestRoleConfigured,
    nightlyRoleConfigured,
  };

  const easProjectId = value(environment, "CROKI_EAS_PROJECT_ID");
  const expoTokenConfigured = value(environment, "CROKI_EXPO_TOKEN") !== null;
  const mobile = {
    ...destinationBase({
      requested: mobileRequested,
      missing: missingValues(mobileRequested, [
        ["CROKI_EAS_PROJECT_ID", easProjectId !== null],
        ["CROKI_EXPO_TOKEN", expoTokenConfigured],
      ]),
      errors:
        easProjectId === INHERITED_T3_EAS_PROJECT_ID
          ? ["CROKI_EAS_PROJECT_ID must not target the inherited T3 project."]
          : [],
    }),
    productionRequested: mobileProductionRequested,
    previewRequested: mobilePreviewRequested,
    easProjectId,
    expoTokenConfigured,
  };

  const destinations = { github, cli, relay, web, signing, discord, mobile };
  const requested =
    releaseRequested ||
    cliRequested ||
    relayRequested ||
    webRequested ||
    signingRequested ||
    discordRequested ||
    mobileRequested;
  const destinationErrors = Object.values(destinations).flatMap((destination) => [
    ...destination.missing.map((name) => `Missing required Croki release configuration: ${name}.`),
    ...destination.errors,
  ]);
  const errors = [
    ...(options.production === true && !requested
      ? ["No Croki production release destination is enabled."]
      : []),
    ...((releaseRequested || webRequested || mobileProductionRequested) && !cliRequested
      ? [
          "Update-capable Croki clients require CROKI_CLI_PUBLISH_ENABLED=true so the exact-version croki-server package publishes first.",
        ]
      : []),
    ...destinationErrors,
  ];
  const valid = errors.length === 0;
  const planEnabled = requested && valid;

  return {
    version: 1,
    mode: options.production === true ? "production" : "plan",
    status: !requested ? (valid ? "disabled" : "invalid") : valid ? "enabled" : "invalid",
    enabled: planEnabled,
    valid,
    destinations,
    errors,
  };
}

export function renderCrokiReleasePlan(plan: CrokiReleasePlan): string {
  return `${JSON.stringify(plan, null, 2)}\n`;
}

function runCli(): void {
  const production = process.argv.includes("--production");
  const plan = buildCrokiReleasePlan(process.env, { production });
  process.stdout.write(renderCrokiReleasePlan(plan));
  if (production && !plan.enabled) {
    process.exitCode = 1;
  }
}

const entryPath = process.argv[1] ? NodePath.resolve(process.argv[1]) : null;
if (entryPath !== null && NodeURL.pathToFileURL(entryPath).href === import.meta.url) {
  runCli();
}
