// @effect-diagnostics nodeBuiltinImport:off
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";

const repoRoot = NodePath.resolve(NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)), "..");

const workspaceFiles = [
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "apps/server/package.json",
  "apps/desktop/package.json",
  "apps/web/package.json",
  "apps/mobile/package.json",
  "apps/mobile/deps/react-native-nitro-markdown-0.5.0.tgz",
  "apps/mobile/modules/croki-markdown-text/package.json",
  "apps/mobile/modules/croki-review-diff/package.json",
  "apps/mobile/modules/croki-terminal/package.json",
  "apps/marketing/package.json",
  "infra/relay/package.json",
  "oxlint-plugin-croki/package.json",
  "packages/client-runtime/package.json",
  "packages/contracts/package.json",
  "packages/shared/package.json",
  "packages/ssh/package.json",
  "packages/tailscale/package.json",
  "packages/effect-acp/package.json",
  "packages/effect-codex-app-server/package.json",
  "scripts/package.json",
] as const;

function copyWorkspaceManifestFixture(targetRoot: string): void {
  for (const relativePath of workspaceFiles) {
    const sourcePath = NodePath.resolve(repoRoot, relativePath);
    const destinationPath = NodePath.resolve(targetRoot, relativePath);
    NodeFS.mkdirSync(NodePath.dirname(destinationPath), { recursive: true });
    NodeFS.cpSync(sourcePath, destinationPath);
  }

  const patchesDirectory = NodePath.resolve(repoRoot, "patches");
  if (NodeFS.existsSync(patchesDirectory)) {
    NodeFS.cpSync(patchesDirectory, NodePath.resolve(targetRoot, "patches"), { recursive: true });
  }
}

function writeMacManifestFixtures(targetRoot: string): { arm64Path: string; x64Path: string } {
  const assetDirectory = NodePath.resolve(targetRoot, "release-assets");
  NodeFS.mkdirSync(assetDirectory, { recursive: true });

  const arm64Path = NodePath.resolve(assetDirectory, "latest-mac.yml");
  const x64Path = NodePath.resolve(assetDirectory, "latest-mac-x64.yml");

  NodeFS.writeFileSync(
    arm64Path,
    `version: 9.9.9-smoke.0
files:
  - url: Croki-9.9.9-smoke.0-arm64.zip
    sha512: arm64zip
    size: 125621344
  - url: Croki-9.9.9-smoke.0-arm64.dmg
    sha512: arm64dmg
    size: 131754935
path: Croki-9.9.9-smoke.0-arm64.zip
sha512: arm64zip
releaseDate: '2026-03-08T10:32:14.587Z'
`,
  );

  NodeFS.writeFileSync(
    x64Path,
    `version: 9.9.9-smoke.0
files:
  - url: Croki-9.9.9-smoke.0-x64.zip
    sha512: x64zip
    size: 132000112
  - url: Croki-9.9.9-smoke.0-x64.dmg
    sha512: x64dmg
    size: 138148807
path: Croki-9.9.9-smoke.0-x64.zip
sha512: x64zip
releaseDate: '2026-03-08T10:36:07.540Z'
`,
  );

  return { arm64Path, x64Path };
}

function writeWindowsManifestFixtures(
  targetRoot: string,
  channel: string,
): { arm64Path: string; x64Path: string } {
  const assetDirectory = NodePath.resolve(targetRoot, "release-assets");
  NodeFS.mkdirSync(assetDirectory, { recursive: true });

  const arm64Path = NodePath.resolve(assetDirectory, `${channel}-win-arm64.yml`);
  const x64Path = NodePath.resolve(assetDirectory, `${channel}-win-x64.yml`);

  NodeFS.writeFileSync(
    arm64Path,
    `version: 9.9.9-smoke.0
files:
  - url: Croki-9.9.9-smoke.0-arm64.exe
    sha512: arm64exe
    size: 126621344
  - url: Croki-9.9.9-smoke.0-arm64.exe.blockmap
    sha512: arm64blockmap
    size: 152344
path: Croki-9.9.9-smoke.0-arm64.exe
sha512: arm64exe
releaseDate: '2026-03-08T10:32:14.587Z'
`,
  );

  NodeFS.writeFileSync(
    x64Path,
    `version: 9.9.9-smoke.0
files:
  - url: Croki-9.9.9-smoke.0-x64.exe
    sha512: x64exe
    size: 132000112
  - url: Croki-9.9.9-smoke.0-x64.exe.blockmap
    sha512: x64blockmap
    size: 160112
path: Croki-9.9.9-smoke.0-x64.exe
sha512: x64exe
releaseDate: '2026-03-08T10:36:07.540Z'
`,
  );

  return { arm64Path, x64Path };
}

function writeWindowsBuilderDebugFixtures(targetRoot: string): {
  arm64Path: string;
  x64Path: string;
} {
  const assetDirectory = NodePath.resolve(targetRoot, "release-assets");
  NodeFS.mkdirSync(assetDirectory, { recursive: true });

  const arm64Path = NodePath.resolve(assetDirectory, "builder-debug-win-arm64.yml");
  const x64Path = NodePath.resolve(assetDirectory, "builder-debug-win-x64.yml");
  const debugFixture = `arm64:
  firstOrDefaultFilePatterns:
    - '**/*'
nsis:
  script: |-
    !include "example.nsh"
`;

  NodeFS.writeFileSync(arm64Path, debugFixture);
  NodeFS.writeFileSync(x64Path, debugFixture);

  return { arm64Path, x64Path };
}
function assertContains(haystack: string, needle: string, message: string): void {
  if (!haystack.includes(needle)) {
    throw new Error(message);
  }
}

function assertNotContains(haystack: string, needle: string, message: string): void {
  if (haystack.includes(needle)) {
    throw new Error(message);
  }
}

function assertCrokiReleaseGuards(): void {
  const releaseWorkflow = NodeFS.readFileSync(
    NodePath.resolve(repoRoot, ".github/workflows/release.yml"),
    "utf8",
  );
  const localNightlyPublisher = NodeFS.readFileSync(
    NodePath.resolve(repoRoot, "scripts/run-local-nightly-release.sh"),
    "utf8",
  );
  const localNightlyInstaller = NodeFS.readFileSync(
    NodePath.resolve(repoRoot, "scripts/install-local-nightly-launch-agent.sh"),
    "utf8",
  );
  const relayWorkflow = NodeFS.readFileSync(
    NodePath.resolve(repoRoot, ".github/workflows/deploy-relay.yml"),
    "utf8",
  );
  const mobileProductionWorkflow = NodeFS.readFileSync(
    NodePath.resolve(repoRoot, ".github/workflows/mobile-eas-production.yml"),
    "utf8",
  );
  const mobilePreviewWorkflow = NodeFS.readFileSync(
    NodePath.resolve(repoRoot, ".github/workflows/mobile-eas-preview.yml"),
    "utf8",
  );
  const mobileShowcaseWorkflow = NodeFS.readFileSync(
    NodePath.resolve(repoRoot, ".github/workflows/mobile-showcase-screenshots.yml"),
    "utf8",
  );

  for (const guard of [
    "CROKI_RELEASE_ENABLED",
    "CROKI_RELEASE_REPOSITORY",
    "CROKI_RELEASE_BRANCH",
    "CROKI_CLI_PACKAGE",
    "CROKI_CLI_PUBLISH_ENABLED",
    "CROKI_RELAY_DOMAIN",
    "CROKI_WEB_DEPLOY_ENABLED",
    "CROKI_SIGNING_ENABLED",
    "CROKI_DISCORD_RELEASE_ENABLED",
    "CROKI_VERCEL_PROJECT_ID",
    "dry_run",
    "node scripts/croki-release-plan.ts",
    "inputs.dry_run != true",
    "needs: [release_guard]",
    "vars.CROKI_CLI_PUBLISH_ENABLED != 'true' && needs.publish_cli.result == 'skipped'",
    "VITE_CROKI_SERVER_PACKAGE_UPDATES_AVAILABLE",
    "croki-release-plan.ts --production",
    "name=Croki v",
    'git push origin "HEAD:$RELEASE_BRANCH"',
  ]) {
    assertContains(releaseWorkflow, guard, `Release workflow is missing guard: ${guard}`);
  }
  for (const inheritedReleaseTarget of [
    "git push origin HEAD:main",
    "secrets.RELEASE_APP_ID",
    "secrets.VERCEL_TOKEN",
    "latest.app.t3.codes",
    "nightly.app.t3.codes",
    "--filter=t3...",
  ]) {
    assertNotContains(
      releaseWorkflow,
      inheritedReleaseTarget,
      `Release workflow still targets inherited T3 release state: ${inheritedReleaseTarget}`,
    );
  }
  assertNotContains(
    releaseWorkflow,
    "schedule:",
    "Release workflow must not schedule billable GitHub-hosted nightlies.",
  );
  assertNotContains(
    localNightlyPublisher,
    "run dist:desktop:artifact -- \\\\",
    "Local nightly publisher must forward build flags without a positional delimiter.",
  );
  for (const guard of [
    "refs/heads/$branch",
    "No changes on $branch since $latest_nightly_tag",
    'rm -f "$lock_dir/pid"',
    'vp_bin" check',
    "--platform mac",
    "--arch arm64",
    'CROKI_DESKTOP_UPDATE_REPOSITORY="$repository"',
    "--prerelease",
    "--latest=false",
    'release view "$tag"',
  ]) {
    assertContains(
      localNightlyPublisher,
      guard,
      `Local nightly publisher is missing guard: ${guard}`,
    );
  }
  for (const guard of [
    "com.croki.nightly-release",
    "StartCalendarInterval",
    "<integer>2</integer>",
    "<integer>15</integer>",
    "launchctl bootstrap",
  ]) {
    assertContains(
      localNightlyInstaller,
      guard,
      `Local nightly installer is missing guard: ${guard}`,
    );
  }

  for (const guard of [
    "workflow_dispatch:",
    "dry_run:",
    "release:croki:plan",
    "inputs.dry_run != true",
    "vars.CROKI_RELAY_DEPLOY_ENABLED == 'true'",
    "github.repository == vars.CROKI_RELEASE_REPOSITORY",
    "github.ref_name == vars.CROKI_RELEASE_BRANCH",
    "Refusing inherited T3 relay destination",
    "secrets.CROKI_CLOUDFLARE_API_TOKEN",
  ]) {
    assertContains(relayWorkflow, guard, `Relay workflow is missing guard: ${guard}`);
  }
  assertNotContains(
    relayWorkflow,
    "secrets.CLOUDFLARE_API_TOKEN",
    "Relay workflow still uses the inherited Cloudflare credential.",
  );
  assertContains(
    relayWorkflow,
    "--filter=croki-relay...",
    "Relay workflow does not install the Croki relay workspace.",
  );
  assertNotContains(
    relayWorkflow,
    "--filter=t3code-relay...",
    "Relay workflow still installs the inherited T3 relay workspace.",
  );

  assertContains(
    releaseWorkflow,
    "--filter=croki-server...",
    "Release workflow does not install the Croki server workspace.",
  );
  assertContains(
    mobileShowcaseWorkflow,
    "--filter=croki-server...",
    "Mobile showcase workflow does not install the Croki server workspace.",
  );
  assertNotContains(
    mobileShowcaseWorkflow,
    "--filter=t3...",
    "Mobile showcase workflow still installs the inherited T3 workspace.",
  );

  for (const guard of ["dry-run", "release:croki:plan", "inputs.mode != 'dry-run'"]) {
    assertContains(
      mobileProductionWorkflow,
      guard,
      `Mobile production workflow is missing dry-run guard: ${guard}`,
    );
  }

  for (const [name, workflow, enableVariable] of [
    ["production", mobileProductionWorkflow, "CROKI_MOBILE_DEPLOY_ENABLED"],
    ["preview", mobilePreviewWorkflow, "CROKI_MOBILE_PREVIEW_ENABLED"],
  ] as const) {
    for (const guard of [
      enableVariable,
      "CROKI_RELEASE_REPOSITORY",
      "CROKI_RELEASE_BRANCH",
      "CROKI_EAS_PROJECT_ID",
      "secrets.CROKI_EXPO_TOKEN",
      "croki-release-plan.ts",
      "Verify configured EAS project",
      "d763fcb8-d37c-41ea-a773-b54a0ab4a454",
    ]) {
      assertContains(workflow, guard, `Mobile ${name} workflow is missing guard: ${guard}`);
    }
    assertNotContains(
      workflow,
      "secrets.EXPO_TOKEN",
      `Mobile ${name} workflow still uses the inherited Expo credential.`,
    );
  }

  for (const guard of ["Verify exact Croki server package exists", "npm view"]) {
    assertContains(
      mobilePreviewWorkflow,
      guard,
      `Mobile preview workflow is missing exact-package guard: ${guard}`,
    );
  }
}

function assertCrokiReleasePlan(): void {
  const scriptPath = NodePath.resolve(repoRoot, "scripts/croki-release-plan.ts");
  const localResult = NodeChildProcess.spawnSync(process.execPath, [scriptPath], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {},
  });
  if (localResult.status !== 0) {
    throw new Error(`Croki local release plan failed:\n${localResult.stderr}`);
  }
  const localPlan = JSON.parse(localResult.stdout) as {
    readonly status?: unknown;
    readonly enabled?: unknown;
    readonly destinations?: Record<string, { readonly status?: unknown }>;
  };
  if (localPlan.status !== "disabled" || localPlan.enabled !== false) {
    throw new Error("Croki local release plan must be safely disabled without configuration.");
  }
  for (const category of ["github", "cli", "relay", "web", "signing", "discord", "mobile"]) {
    if (localPlan.destinations?.[category]?.status !== "disabled") {
      throw new Error(`Croki local release plan is missing disabled category: ${category}.`);
    }
  }

  const githubOnlyResult = NodeChildProcess.spawnSync(
    process.execPath,
    [scriptPath, "--production"],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: {
        CROKI_RELEASE_ENABLED: "true",
        CROKI_RELEASE_REPOSITORY: "rhinehart514/croki",
        CROKI_RELEASE_BRANCH: "croki/main",
      },
    },
  );
  if (githubOnlyResult.status !== 0) {
    throw new Error(`Croki GitHub-only release plan failed:\n${githubOnlyResult.stderr}`);
  }
  const githubOnlyPlan = JSON.parse(githubOnlyResult.stdout) as {
    readonly status?: unknown;
    readonly enabled?: unknown;
    readonly destinations?: Record<string, { readonly status?: unknown }>;
  };
  if (githubOnlyPlan.status !== "enabled" || githubOnlyPlan.enabled !== true) {
    throw new Error("Croki GitHub-only release plan must allow desktop asset publication.");
  }
  if (githubOnlyPlan.destinations?.github?.status !== "enabled") {
    throw new Error("Croki GitHub-only release plan did not enable GitHub publication.");
  }
  for (const category of ["cli", "relay", "web", "signing", "discord", "mobile"]) {
    if (githubOnlyPlan.destinations?.[category]?.status !== "disabled") {
      throw new Error(`Croki GitHub-only plan unexpectedly enabled category: ${category}.`);
    }
  }

  const secretMarker = "CROKI_RELEASE_SMOKE_SECRET_MUST_NOT_RENDER";
  const productionResult = NodeChildProcess.spawnSync(
    process.execPath,
    [scriptPath, "--production"],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: {
        CROKI_RELEASE_ENABLED: "true",
        CROKI_RELEASE_REPOSITORY: "pingdotgg/t3code",
        CROKI_RELEASE_BRANCH: "main",
        CROKI_CLI_PACKAGE: "t3",
        CROKI_RELAY_DOMAIN: "relay.t3.codes",
        CROKI_WEB_ROUTER_URL: "https://app.t3.codes",
        CROKI_WEB_LATEST_DOMAIN: "latest.app.t3.codes",
        CROKI_WEB_NIGHTLY_DOMAIN: "nightly.app.t3.codes",
        CROKI_VERCEL_ORG_ID: "inherited-org",
        CROKI_VERCEL_PROJECT_ID: "inherited-project",
        CROKI_RELEASE_APP_PRIVATE_KEY: secretMarker,
        CROKI_DISCORD_RELEASE_WEBHOOK_URL: secretMarker,
      },
    },
  );
  if (productionResult.status === 0) {
    throw new Error("Croki production release plan unexpectedly accepted inherited destinations.");
  }
  assertNotContains(
    productionResult.stdout,
    secretMarker,
    "Croki release plan rendered a secret value.",
  );
  const productionPlan = JSON.parse(productionResult.stdout) as {
    readonly status?: unknown;
    readonly enabled?: unknown;
  };
  if (productionPlan.status !== "invalid" || productionPlan.enabled !== false) {
    throw new Error("Croki production release plan did not fail closed.");
  }
}

function assertExists(path: string, message: string): void {
  if (!NodeFS.existsSync(path)) {
    throw new Error(message);
  }
}

function assertPackageVersion(path: string, version: string): void {
  const packageJson = JSON.parse(NodeFS.readFileSync(path, "utf8")) as {
    readonly version?: unknown;
  };

  if (packageJson.version !== version) {
    throw new Error(`Expected ${path} to have version ${version}.`);
  }
}

function assertMissing(path: string, message: string): void {
  if (NodeFS.existsSync(path)) {
    throw new Error(message);
  }
}

const tempRoot = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-release-smoke-"));

try {
  assertCrokiReleaseGuards();
  assertCrokiReleasePlan();
  copyWorkspaceManifestFixture(tempRoot);

  NodeChildProcess.execFileSync(
    process.execPath,
    [
      NodePath.resolve(repoRoot, "scripts/update-release-package-versions.ts"),
      "9.9.9-smoke.0",
      "--root",
      tempRoot,
    ],
    {
      cwd: repoRoot,
      stdio: "inherit",
    },
  );

  NodeFS.rmSync(NodePath.resolve(tempRoot, "pnpm-lock.yaml"), { force: true });

  NodeChildProcess.execFileSync("vp", ["install", "--lockfile-only", "--ignore-scripts"], {
    cwd: tempRoot,
    stdio: "inherit",
  });

  const lockfile = NodeFS.readFileSync(NodePath.resolve(tempRoot, "pnpm-lock.yaml"), "utf8");
  assertContains(lockfile, "lockfileVersion:", "Expected pnpm-lock.yaml to be regenerated.");

  for (const relativePath of [
    "apps/server/package.json",
    "apps/desktop/package.json",
    "apps/web/package.json",
    "packages/contracts/package.json",
  ]) {
    assertPackageVersion(NodePath.resolve(tempRoot, relativePath), "9.9.9-smoke.0");
  }

  const nightlyReleaseMetadata = NodeChildProcess.execFileSync(
    process.execPath,
    [
      NodePath.resolve(repoRoot, "scripts/resolve-nightly-release.ts"),
      "--date",
      "20260413",
      "--run-number",
      "321",
      "--sha",
      "abcdef1234567890",
      "--root",
      tempRoot,
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
    },
  );
  assertContains(
    nightlyReleaseMetadata,
    "version=9.9.10-nightly.20260413.321",
    "Expected nightly metadata to contain the derived nightly version.",
  );
  assertContains(
    nightlyReleaseMetadata,
    "tag=v9.9.10-nightly.20260413.321",
    "Expected nightly metadata to contain the derived nightly tag.",
  );
  assertContains(
    nightlyReleaseMetadata,
    "name=Croki Nightly 9.9.10-nightly.20260413.321 (abcdef123456)",
    "Expected nightly metadata to include the short commit SHA in the release name.",
  );

  const { arm64Path, x64Path } = writeMacManifestFixtures(tempRoot);
  NodeChildProcess.execFileSync(
    process.execPath,
    [
      NodePath.resolve(repoRoot, "scripts/merge-update-manifests.ts"),
      "--platform",
      "mac",
      arm64Path,
      x64Path,
    ],
    {
      cwd: repoRoot,
      stdio: "inherit",
    },
  );

  const mergedManifest = NodeFS.readFileSync(arm64Path, "utf8");
  assertContains(
    mergedManifest,
    "Croki-9.9.9-smoke.0-arm64.zip",
    "Merged manifest is missing the arm64 asset.",
  );
  assertContains(
    mergedManifest,
    "Croki-9.9.9-smoke.0-x64.zip",
    "Merged manifest is missing the x64 asset.",
  );

  const { arm64Path: winArm64Path, x64Path: winX64Path } = writeWindowsManifestFixtures(
    tempRoot,
    "latest",
  );
  const mergedWindowsManifestPath = NodePath.resolve(tempRoot, "release-assets/latest.yml");
  const { arm64Path: nightlyWinArm64Path, x64Path: nightlyWinX64Path } =
    writeWindowsManifestFixtures(tempRoot, "nightly");
  const mergedNightlyWindowsManifestPath = NodePath.resolve(tempRoot, "release-assets/nightly.yml");
  const { arm64Path: previewWinArm64Path, x64Path: previewWinX64Path } =
    writeWindowsManifestFixtures(tempRoot, "preview");
  const mergedPreviewWindowsManifestPath = NodePath.resolve(tempRoot, "release-assets/preview.yml");
  const { arm64Path: winDebugArm64Path, x64Path: winDebugX64Path } =
    writeWindowsBuilderDebugFixtures(tempRoot);
  NodeChildProcess.execFileSync(
    "bash",
    [
      "-lc",
      `
        release_assets_dir=${JSON.stringify(NodePath.resolve(tempRoot, "release-assets"))}
        shopt -s nullglob
        found_windows_manifest=false
        for x64_manifest in "$release_assets_dir"/*-win-x64.yml; do
          if [[ "$(basename "$x64_manifest")" == builder-debug-* ]]; then
            continue
          fi

          arm64_manifest="\${x64_manifest/-x64.yml/-arm64.yml}"
          output_manifest="\${x64_manifest/-win-x64.yml/.yml}"
          if [[ ! -f "$arm64_manifest" ]]; then
            echo "Missing matching arm64 Windows manifest for $x64_manifest" >&2
            exit 1
          fi

          found_windows_manifest=true
          ${JSON.stringify(process.execPath)} ${JSON.stringify(NodePath.resolve(repoRoot, "scripts/merge-update-manifests.ts"))} --platform win \
            "$arm64_manifest" \
            "$x64_manifest" \
            "$output_manifest"
          rm -f "$arm64_manifest" "$x64_manifest"
        done

        if [[ "$found_windows_manifest" != true ]]; then
          echo "No Windows updater manifests found to merge." >&2
          exit 1
        fi
      `,
    ],
    {
      cwd: repoRoot,
      stdio: "inherit",
    },
  );

  const mergedWindowsManifest = NodeFS.readFileSync(mergedWindowsManifestPath, "utf8");
  assertContains(
    mergedWindowsManifest,
    "Croki-9.9.9-smoke.0-arm64.exe",
    "Merged Windows manifest is missing the arm64 asset.",
  );
  assertContains(
    mergedWindowsManifest,
    "Croki-9.9.9-smoke.0-x64.exe",
    "Merged Windows manifest is missing the x64 asset.",
  );
  const mergedNightlyWindowsManifest = NodeFS.readFileSync(
    mergedNightlyWindowsManifestPath,
    "utf8",
  );
  assertContains(
    mergedNightlyWindowsManifest,
    "Croki-9.9.9-smoke.0-arm64.exe",
    "Merged nightly Windows manifest is missing the arm64 asset.",
  );
  assertContains(
    mergedNightlyWindowsManifest,
    "Croki-9.9.9-smoke.0-x64.exe",
    "Merged nightly Windows manifest is missing the x64 asset.",
  );
  const mergedPreviewWindowsManifest = NodeFS.readFileSync(
    mergedPreviewWindowsManifestPath,
    "utf8",
  );
  assertContains(
    mergedPreviewWindowsManifest,
    "Croki-9.9.9-smoke.0-arm64.exe",
    "Merged preview Windows manifest is missing the arm64 asset.",
  );
  assertContains(
    mergedPreviewWindowsManifest,
    "Croki-9.9.9-smoke.0-x64.exe",
    "Merged preview Windows manifest is missing the x64 asset.",
  );
  assertMissing(
    winArm64Path,
    "Windows release smoke unexpectedly kept the arm64 updater manifest.",
  );
  assertMissing(winX64Path, "Windows release smoke unexpectedly kept the x64 updater manifest.");
  assertMissing(
    nightlyWinArm64Path,
    "Windows release smoke unexpectedly kept the nightly arm64 updater manifest.",
  );
  assertMissing(
    nightlyWinX64Path,
    "Windows release smoke unexpectedly kept the nightly x64 updater manifest.",
  );
  assertMissing(
    previewWinArm64Path,
    "Windows release smoke unexpectedly kept the preview arm64 updater manifest.",
  );
  assertMissing(
    previewWinX64Path,
    "Windows release smoke unexpectedly kept the preview x64 updater manifest.",
  );
  assertExists(
    winDebugArm64Path,
    "Windows release smoke unexpectedly removed the arm64 builder debug fixture.",
  );
  assertExists(
    winDebugX64Path,
    "Windows release smoke unexpectedly removed the x64 builder debug fixture.",
  );

  Effect.runSync(Console.log("Release smoke checks passed."));
} finally {
  NodeFS.rmSync(tempRoot, { recursive: true, force: true });
}
