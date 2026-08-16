import { EnvironmentId, ProjectId } from "@croki/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Layer from "effect/Layer";
import { Atom } from "effect/unstable/reactivity";

import type { EnvironmentRegistry } from "../connection/registry.ts";
import { createPeopleEnvironmentAtoms } from "./people.ts";

describe("createPeopleEnvironmentAtoms", () => {
  it("keeps Project People reads isolated by environment and project", () => {
    const runtime = Atom.runtime(Layer.empty) as unknown as Atom.AtomRuntime<
      EnvironmentRegistry,
      never
    >;
    const people = createPeopleEnvironmentAtoms(runtime);
    const environmentId = EnvironmentId.make("environment-1");
    const projectId = ProjectId.make("project-1");
    const target = { environmentId, input: { projectId } };

    expect(people.members(target)).toBe(people.members({ ...target, input: { projectId } }));
    expect(
      people.members({ environmentId, input: { projectId: ProjectId.make("project-2") } }),
    ).not.toBe(people.members(target));
    expect(
      people.members({
        environmentId: EnvironmentId.make("environment-2"),
        input: { projectId },
      }),
    ).not.toBe(people.members(target));
  });
});
