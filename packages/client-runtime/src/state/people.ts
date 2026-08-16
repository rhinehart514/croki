import type { EnvironmentId as EnvironmentIdType } from "@croki/contracts";
import { WS_METHODS } from "@croki/contracts";
import { Atom } from "effect/unstable/reactivity";

import type { EnvironmentRegistry } from "../connection/registry.ts";
import {
  createAtomCommandScheduler,
  createEnvironmentRpcCommand,
  createEnvironmentRpcQueryAtomFamily,
} from "./runtime.ts";

/**
 * Shared state for the Project People surface. Membership and invitation
 * reads are deliberately scoped by environment and project: the same
 * ProjectId can be present on more than one owner-hosted environment.
 */
export function createPeopleEnvironmentAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | R, E>,
) {
  const projectScheduler = createAtomCommandScheduler();
  const projectConcurrency = {
    mode: "serial" as const,
    key: ({ environmentId, input }: { environmentId: string; input: { projectId: string } }) =>
      JSON.stringify([environmentId, input.projectId]),
  };

  return {
    current: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:identity:current",
      tag: WS_METHODS.identityCurrent,
      staleTimeMs: 30_000,
      idleTtlMs: 5 * 60_000,
    }),
    members: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:project-people:members",
      tag: WS_METHODS.projectsListMembers,
      staleTimeMs: 10_000,
      idleTtlMs: 5 * 60_000,
    }),
    invitations: createEnvironmentRpcQueryAtomFamily(runtime, {
      label: "environment-data:project-people:invitations",
      tag: WS_METHODS.projectsListInvitations,
      staleTimeMs: 10_000,
      idleTtlMs: 5 * 60_000,
    }),
    register: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:commands:identity:register",
      tag: WS_METHODS.identityRegister,
      scheduler: projectScheduler,
      concurrency: {
        mode: "singleFlight",
        key: ({ environmentId }: { readonly environmentId: EnvironmentIdType }) => environmentId,
      },
    }),
    ensureOwner: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:commands:project-people:ensure-owner",
      tag: WS_METHODS.projectsEnsureOwner,
      scheduler: projectScheduler,
      concurrency: projectConcurrency,
    }),
    createInvitation: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:commands:project-people:create-invitation",
      tag: WS_METHODS.projectsCreateInvitation,
      scheduler: projectScheduler,
      concurrency: projectConcurrency,
    }),
    acceptInvitation: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:commands:project-people:accept-invitation",
      tag: WS_METHODS.projectsAcceptInvitation,
      scheduler: projectScheduler,
      concurrency: {
        mode: "singleFlight",
        key: ({ environmentId }: { readonly environmentId: EnvironmentIdType }) => environmentId,
      },
    }),
    revokeInvitation: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:commands:project-people:revoke-invitation",
      tag: WS_METHODS.projectsRevokeInvitation,
      scheduler: projectScheduler,
      concurrency: projectConcurrency,
    }),
    removeMember: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:commands:project-people:remove-member",
      tag: WS_METHODS.projectsRemoveMember,
      scheduler: projectScheduler,
      concurrency: projectConcurrency,
    }),
    transferOwnership: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:commands:project-people:transfer-ownership",
      tag: WS_METHODS.projectsTransferOwnership,
      scheduler: projectScheduler,
      concurrency: projectConcurrency,
    }),
  };
}
