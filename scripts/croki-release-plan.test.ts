// @effect-diagnostics nodeBuiltinImport:off
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import { describe, expect, it } from "vite-plus/test";

import { buildCrokiReleasePlan, renderCrokiReleasePlan } from "./croki-release-plan.js";

const scriptPath = NodePath.resolve(
  NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)),
  "croki-release-plan.ts",
);

const safeProductionEnvironment = {
  CROKI_RELEASE_ENABLED: "true",
  CROKI_RELEASE_REPOSITORY: "example/croki",
  CROKI_RELEASE_BRANCH: "croki/main",
  CROKI_RELEASE_APP_ID: "app-id-secret",
  CROKI_RELEASE_APP_PRIVATE_KEY: "private-key-secret",
  CROKI_CLI_PACKAGE: "@example/croki",
  CROKI_RELAY_DOMAIN: "relay.croki.example",
  CROKI_VERCEL_ORG_ID: "croki-org",
  CROKI_VERCEL_PROJECT_ID: "croki-project",
  CROKI_VERCEL_TEAM_SLUG: "croki-team",
  CROKI_WEB_ROUTER_URL: "https://app.croki.example",
  CROKI_WEB_LATEST_DOMAIN: "latest.croki.example",
  CROKI_WEB_NIGHTLY_DOMAIN: "nightly.croki.example",
  CROKI_MACOS_CERTIFICATE: "mac-certificate-secret",
  CROKI_MACOS_CERTIFICATE_PASSWORD: "mac-password-secret",
  CROKI_APPLE_API_KEY: "apple-api-secret",
  CROKI_APPLE_API_KEY_ID: "apple-key-id",
  CROKI_APPLE_API_ISSUER: "apple-issuer",
  CROKI_APPLE_TEAM_ID: "apple-team",
  CROKI_MACOS_PROVISIONING_PROFILE: "provisioning-profile-secret",
  CROKI_AZURE_TENANT_ID: "azure-tenant",
  CROKI_AZURE_CLIENT_ID: "azure-client",
  CROKI_AZURE_CLIENT_SECRET: "azure-client-secret",
  CROKI_AZURE_TRUSTED_SIGNING_ENDPOINT: "https://signing.example",
  CROKI_AZURE_TRUSTED_SIGNING_ACCOUNT_NAME: "croki-signing",
  CROKI_AZURE_TRUSTED_SIGNING_CERTIFICATE_PROFILE_NAME: "croki-profile",
  CROKI_AZURE_TRUSTED_SIGNING_PUBLISHER_NAME: "Croki",
  CROKI_DISCORD_RELEASE_WEBHOOK_URL: "discord-webhook-secret",
  CROKI_DISCORD_RELEASE_LATEST_ROLE_ID: "discord-latest-secret",
  CROKI_DISCORD_RELEASE_NIGHTLY_ROLE_ID: "discord-nightly-secret",
  CROKI_MOBILE_DEPLOY_ENABLED: "true",
  CROKI_EAS_PROJECT_ID: "11111111-2222-3333-4444-555555555555",
  CROKI_EXPO_TOKEN: "expo-token-secret",
} as const;

describe("Croki release plan", () => {
  it("reports every absent destination as disabled and exits local planning successfully", () => {
    const plan = buildCrokiReleasePlan({});
    expect(plan).toMatchObject({
      version: 1,
      mode: "plan",
      status: "disabled",
      enabled: false,
      valid: true,
    });
    expect(Object.keys(plan.destinations).sort()).toEqual([
      "cli",
      "discord",
      "github",
      "mobile",
      "relay",
      "signing",
      "web",
    ]);
    for (const destination of Object.values(plan.destinations)) {
      expect(destination.status).toBe("disabled");
      expect(destination.enabled).toBe(false);
    }

    const result = NodeChildProcess.spawnSync(process.execPath, [scriptPath], {
      encoding: "utf8",
      env: {},
    });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      status: "disabled",
      enabled: false,
      valid: true,
    });
  });

  it("enables a fully configured Croki-owned production plan", () => {
    const plan = buildCrokiReleasePlan(safeProductionEnvironment, { production: true });
    expect(plan.status).toBe("enabled");
    expect(plan.enabled).toBe(true);
    expect(plan.valid).toBe(true);
    expect(plan.errors).toEqual([]);
    for (const destination of Object.values(plan.destinations)) {
      expect(destination.status).toBe("enabled");
      expect(destination.enabled).toBe(true);
    }
  });

  it("never enables inherited T3 destinations or a push to main", () => {
    const plan = buildCrokiReleasePlan(
      {
        ...safeProductionEnvironment,
        CROKI_RELEASE_REPOSITORY: "pingdotgg/t3code",
        CROKI_RELEASE_BRANCH: "main",
        CROKI_CLI_PACKAGE: "t3",
        CROKI_RELAY_DOMAIN: "relay.t3.codes",
        CROKI_WEB_ROUTER_URL: "https://app.t3.codes",
        CROKI_WEB_LATEST_DOMAIN: "latest.app.t3.codes",
        CROKI_WEB_NIGHTLY_DOMAIN: "nightly.app.t3.codes",
        CROKI_EAS_PROJECT_ID: "d763fcb8-d37c-41ea-a773-b54a0ab4a454",
      },
      { production: true },
    );
    expect(plan.status).toBe("invalid");
    expect(plan.enabled).toBe(false);
    expect(plan.destinations.github.status).toBe("invalid");
    expect(plan.destinations.github.enabled).toBe(false);
    expect(plan.destinations.cli.status).toBe("invalid");
    expect(plan.destinations.cli.enabled).toBe(false);
    expect(plan.destinations.relay.status).toBe("invalid");
    expect(plan.destinations.relay.enabled).toBe(false);
    expect(plan.destinations.web.status).toBe("invalid");
    expect(plan.destinations.web.enabled).toBe(false);
    expect(plan.destinations.mobile.status).toBe("invalid");
    expect(plan.destinations.mobile.enabled).toBe(false);
    expect(plan.errors.join("\n")).toContain("pushes to main");
  });

  it("reports credential presence without ever rendering secret values", () => {
    const marker = "DO_NOT_PRINT_THIS_SECRET";
    const plan = buildCrokiReleasePlan({
      ...safeProductionEnvironment,
      CROKI_RELEASE_APP_PRIVATE_KEY: marker,
      CROKI_MACOS_CERTIFICATE: marker,
      CROKI_AZURE_CLIENT_SECRET: marker,
      CROKI_DISCORD_RELEASE_WEBHOOK_URL: marker,
      CROKI_EXPO_TOKEN: marker,
    });
    const output = renderCrokiReleasePlan(plan);
    expect(output).not.toContain(marker);
    expect(plan.destinations.github.releaseAppPrivateKeyConfigured).toBe(true);
    expect(plan.destinations.signing.macosCredentialsConfigured).toBe(true);
    expect(plan.destinations.signing.windowsCredentialsConfigured).toBe(true);
    expect(plan.destinations.discord.webhookConfigured).toBe(true);
    expect(plan.destinations.mobile.expoTokenConfigured).toBe(true);
  });

  it("fails closed in production mode but performs no filesystem writes", () => {
    const productionPlan = buildCrokiReleasePlan({}, { production: true });
    expect(productionPlan).toMatchObject({
      mode: "production",
      status: "invalid",
      enabled: false,
      valid: false,
    });
    expect(productionPlan.errors).toContain("No Croki production release destination is enabled.");

    const workingDirectory = NodeFS.mkdtempSync(
      NodePath.join(NodeOS.tmpdir(), "croki-release-plan-"),
    );
    try {
      const result = NodeChildProcess.spawnSync(process.execPath, [scriptPath, "--production"], {
        cwd: workingDirectory,
        encoding: "utf8",
        env: {},
      });
      expect(result.status).toBe(1);
      expect(JSON.parse(result.stdout)).toMatchObject({
        mode: "production",
        status: "invalid",
      });
      expect(NodeFS.readdirSync(workingDirectory)).toEqual([]);
    } finally {
      NodeFS.rmSync(workingDirectory, { recursive: true, force: true });
    }
  });
});
