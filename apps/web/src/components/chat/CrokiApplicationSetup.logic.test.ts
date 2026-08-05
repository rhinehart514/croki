import { describe, expect, it } from "vite-plus/test";

import {
  buildApplicationLineage,
  discoverApplicationManifest,
  initialApplicationLineageDraft,
  validateApplicationLineageDraft,
} from "./CrokiApplicationSetup.logic";

describe("Croki application setup", () => {
  it("prefills grounded package identity as the version being built", () => {
    const evidence = discoverApplicationManifest({
      packageJson: JSON.stringify({ name: "@acme/studio", version: "1.7.0" }),
    });

    expect(evidence).toEqual({
      path: "package.json",
      name: "@acme/studio",
      version: "1.7.0",
      description: null,
    });
    expect(initialApplicationLineageDraft("studio", evidence)).toEqual({
      name: "@acme/studio",
      releasedVersion: "",
      releasedSummary: "",
      buildingVersion: "1.7.0",
      buildingIntent: "Carry the project's current work into @acme/studio 1.7.0.",
    });
  });

  it("discovers Python and Rust root manifests without treating malformed files as truth", () => {
    expect(
      discoverApplicationManifest({
        packageJson: "not json",
        pyprojectToml: '[project]\nname = "orbit"\nversion = "0.8.0"\n',
      }),
    ).toEqual({ path: "pyproject.toml", name: "orbit", version: "0.8.0", description: null });
    expect(
      discoverApplicationManifest({ cargoToml: '[package]\nname = "relay"\nversion = "2.1.0"' }),
    ).toEqual({ path: "Cargo.toml", name: "relay", version: "2.1.0", description: null });
  });

  it("prepares building intent from project Threads instead of requiring transcription", () => {
    const evidence = discoverApplicationManifest({
      packageJson: JSON.stringify({ name: "Croki", version: "0.4.8" }),
    });

    expect(
      initialApplicationLineageDraft("croki", evidence, [
        "Share project direction",
        "Detect overlapping files",
      ]),
    ).toMatchObject({
      buildingVersion: "0.4.8",
      buildingIntent:
        "Bring Croki forward through the current project work: Share project direction; Detect overlapping files.",
    });
  });

  it("requires founder judgment for every declared state", () => {
    expect(
      validateApplicationLineageDraft({
        name: "Acme",
        releasedVersion: "1.0.0",
        releasedSummary: "",
        buildingVersion: "1.1.0",
        buildingIntent: "",
      }),
    ).toEqual({
      releasedSummary: "Describe what users can already rely on.",
      buildingIntent: "Describe what this version should change.",
    });
  });

  it("builds bounded released and building lineage without invented facts", () => {
    const application = buildApplicationLineage({
      name: "Acme",
      releasedVersion: "1.0.0",
      releasedSummary: "Teams can publish a reviewed site.",
      buildingVersion: "1.1.0",
      buildingIntent: "Let teams compare the working site with its last release.",
    });

    expect(application).toMatchObject({
      version: 1,
      application: { name: "Acme" },
      released: { version: "1.0.0", product: [], sources: [] },
      building: { version: "1.1.0", successSignals: [] },
    });
  });
});
