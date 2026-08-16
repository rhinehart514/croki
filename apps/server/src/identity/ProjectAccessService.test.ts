import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { AuthSessionId, IdentityRegisterInput, ProjectId } from "@croki/contracts";
import * as AuthSessions from "../persistence/AuthSessions.ts";
import { SqlitePersistenceMemory } from "../persistence/Layers/Sqlite.ts";
import * as ProjectAccessService from "./ProjectAccessService.ts";

const serviceLayer = ProjectAccessService.layer.pipe(
  Layer.provideMerge(AuthSessions.layer),
  Layer.provideMerge(SqlitePersistenceMemory),
  Layer.provideMerge(NodeServices.layer),
);

const session = (sessionId: string) => ({
  sessionId,
  subject: `subject-${sessionId}`,
  scopes: JSON.stringify(["access:write"]),
  method: "browser-session-cookie",
  client_device_type: "desktop",
  issued_at: "2026-08-16T00:00:00.000Z",
  expires_at: "2030-08-16T00:00:00.000Z",
});

it.layer(serviceLayer)("ProjectAccessService", (it) => {
  it.effect("registers identities, consumes invitations once, and enforces live membership", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* sql`
        INSERT INTO auth_sessions (
          session_id, subject, scopes, method, client_device_type, issued_at, expires_at
        ) VALUES (
          ${session("owner").sessionId}, ${session("owner").subject}, ${session("owner").scopes},
          ${session("owner").method}, ${session("owner").client_device_type},
          ${session("owner").issued_at}, ${session("owner").expires_at}
        ), (
          ${session("member").sessionId}, ${session("member").subject}, ${session("member").scopes},
          ${session("member").method}, ${session("member").client_device_type},
          ${session("member").issued_at}, ${session("member").expires_at}
        )
      `;

      const access = yield* ProjectAccessService.ProjectAccessService;
      const ownerSession = AuthSessionId.make("owner");
      const memberSession = AuthSessionId.make("member");
      const projectId = ProjectId.make("project-a");
      const registerInput = {
        displayName: "Owner",
        deviceLabel: "Owner Mac",
        deviceType: "desktop",
      } satisfies IdentityRegisterInput;

      const ownerIdentity = yield* access.register(ownerSession, registerInput);
      const memberIdentity = yield* access.register(memberSession, {
        ...registerInput,
        displayName: "Member",
        deviceLabel: "Member Mac",
      });
      assert.isNotNull(ownerIdentity.person);
      assert.isNotNull(memberIdentity.person);

      const ownerMembership = yield* access.ensureProjectOwner(ownerSession, projectId);
      assert.equal(ownerMembership.role, "owner");

      const invitation = yield* access.createInvitation(ownerSession, {
        projectId,
        ttlSeconds: 3600,
      });
      const acceptedMembership = yield* access.acceptInvitation(memberSession, {
        secret: invitation.secret,
      });
      assert.equal(acceptedMembership.role, "member");

      const listedMembers = yield* access.listMembers(ownerSession, projectId);
      assert.deepEqual(
        listedMembers.members.map((member) => [member.displayName, member.role]),
        [
          ["Owner", "owner"],
          ["Member", "member"],
        ],
      );

      const secondAttempt = yield* Effect.flip(
        access.acceptInvitation(memberSession, { secret: invitation.secret }),
      );
      assert.equal(secondAttempt._tag, "ProjectInvitationError");
      if (secondAttempt._tag === "ProjectInvitationError") {
        assert.equal(secondAttempt.reason, "accepted");
      }

      yield* access.removeMember(ownerSession, {
        projectId,
        personId: memberIdentity.person!.personId,
      });
      const removedAuthorization = yield* Effect.flip(
        access.authorizeProject(memberSession, projectId),
      );
      assert.equal(removedAuthorization._tag, "ProjectMembershipError");
      if (removedAuthorization._tag === "ProjectMembershipError") {
        assert.equal(removedAuthorization.reason, "not_a_member");
      }
    }),
  );
});
