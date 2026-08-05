import { describe, expect, it } from "@effect/vitest";

import {
  buildComponentCatalog,
  extractComponents,
  isComponentSourcePath,
} from "./WorkspaceComponentCatalog.ts";

describe("WorkspaceComponentCatalog", () => {
  it("finds named and default React component exports", () => {
    expect(
      extractComponents(
        "src/components/ProfileCard.tsx",
        `export function ProfileCard() { return <article /> }
         export default function ProfilePage() { return <ProfileCard /> }`,
      ).map(({ displayName, exportName, isDefaultExport }) => ({
        displayName,
        exportName,
        isDefaultExport,
      })),
    ).toEqual([
      { displayName: "ProfileCard", exportName: "ProfileCard", isDefaultExport: false },
      { displayName: "ProfilePage", exportName: "ProfilePage", isDefaultExport: true },
    ]);
  });

  it("derives single-file component names and excludes non-product sources", () => {
    expect(
      extractComponents("src/views/AccountPanel.vue", "<template><main /></template>")[0],
    ).toMatchObject({ displayName: "AccountPanel", exportName: "default", framework: "vue" });
    expect(extractComponents("src/StatusBadge.svelte", "<span>Status</span>")[0]).toMatchObject({
      displayName: "StatusBadge",
      framework: "svelte",
    });
    expect(isComponentSourcePath("src/Button.test.tsx")).toBe(false);
    expect(isComponentSourcePath("dist/Button.tsx")).toBe(false);
  });

  it("ranks likely product components before examples", async () => {
    const files = new Map([
      ["src/examples/Demo.tsx", "export function Demo() { return <div /> }"],
      ["src/components/AccountMenu.tsx", "export function AccountMenu() { return <nav /> }"],
    ]);
    const result = await buildComponentCatalog(
      [...files.keys()].map((path) => ({ path, kind: "file" as const })),
      async (path) => files.get(path) ?? "",
    );
    expect(result.components.map((component) => component.displayName)).toEqual([
      "AccountMenu",
      "Demo",
    ]);
  });
});
