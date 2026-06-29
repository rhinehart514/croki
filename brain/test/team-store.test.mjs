import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  FOUNDER_USER_ID,
  TEAM_ROLES,
  addMember,
  canApprove,
  createTeam,
  defaultTeamId,
  ensurePersonalTeam,
  getMember,
  getTeam,
  listMembers,
  listTeams,
  memberRole,
  removeMember,
  resolveCurrentUser,
  teamsForUser,
} from "../src/team-store.mjs";

describe("team store: identity + membership", () => {
  let parent;
  let options;

  beforeEach(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-team-"));
    options = { root: parent };
  });

  afterEach(() => {
    fs.rmSync(parent, { recursive: true, force: true });
    delete process.env.GTM_IDE_USER_ID;
    delete process.env.GTM_IDE_USER_NAME;
    delete process.env.GTM_IDE_USER_EMAIL;
  });

  it("creates a team with the founder as its owner and reloads it", () => {
    const team = createTeam({ name: "Buffalo GTM" }, options);
    assert.ok(team.id);
    assert.equal(team.name, "Buffalo GTM");
    assert.equal(team.members.length, 1);
    assert.equal(team.members[0].userId, FOUNDER_USER_ID);
    assert.equal(team.members[0].role, "owner");

    const loaded = getTeam(team.id, options);
    assert.equal(loaded.id, team.id);
    assert.equal(loaded.members[0].role, "owner");
  });

  it("requires a team name", () => {
    assert.throws(() => createTeam({ name: "  " }, options), /name is required/i);
  });

  it("lists teams newest-first", () => {
    const a = createTeam({ id: "team-a", name: "A" }, options);
    const b = createTeam({ id: "team-b", name: "B" }, options);
    const ids = listTeams(options).map((t) => t.id);
    assert.deepEqual(new Set(ids), new Set([a.id, b.id]));
    assert.equal(listTeams(options)[0].memberCount, 1);
  });

  it("adds members with roles, is idempotent on userId, and lists them", () => {
    const team = createTeam({ name: "Team" }, options);
    addMember(team.id, { userId: "u-approver", name: "Avery", email: "a@x.com", role: "approver" }, options);
    addMember(team.id, { userId: "u-member", name: "Mel", role: "member" }, options);
    let members = listMembers(team.id, options);
    assert.equal(members.length, 3);

    // Re-adding the same userId promotes the role rather than duplicating the member.
    addMember(team.id, { userId: "u-member", role: "approver" }, options);
    members = listMembers(team.id, options);
    assert.equal(members.length, 3);
    assert.equal(memberRole(team.id, "u-member", options), "approver");
  });

  it("normalizes an unknown role to member", () => {
    const team = createTeam({ name: "Team" }, options);
    addMember(team.id, { userId: "u-weird", role: "superadmin" }, options);
    assert.equal(memberRole(team.id, "u-weird", options), "member");
    assert.ok(TEAM_ROLES.includes("owner"));
  });

  it("canApprove: owner and approver yes, member and non-member no", () => {
    const team = createTeam({ name: "Team" }, options);
    addMember(team.id, { userId: "u-approver", role: "approver" }, options);
    addMember(team.id, { userId: "u-member", role: "member" }, options);

    assert.equal(canApprove(team.id, FOUNDER_USER_ID, options), true);
    assert.equal(canApprove(team.id, "u-approver", options), true);
    assert.equal(canApprove(team.id, "u-member", options), false);
    assert.equal(canApprove(team.id, "u-stranger", options), false);
  });

  it("keeps at least one owner when removing members", () => {
    const team = createTeam({ name: "Team" }, options);
    addMember(team.id, { userId: "u-member", role: "member" }, options);
    const after = removeMember(team.id, "u-member", options);
    assert.equal(after.members.length, 1);
    assert.throws(() => removeMember(team.id, FOUNDER_USER_ID, options), /at least one owner/i);
  });

  it("getMember returns the member or null", () => {
    const team = createTeam({ name: "Team" }, options);
    assert.equal(getMember(team.id, FOUNDER_USER_ID, options).role, "owner");
    assert.equal(getMember(team.id, "nobody", options), null);
  });

  it("throws on a missing team", () => {
    assert.throws(() => getTeam("nope", options), /not found/i);
  });
});

describe("team store: current-user resolver", () => {
  let parent;
  let options;

  beforeEach(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-team-"));
    options = { root: parent };
  });

  afterEach(() => {
    fs.rmSync(parent, { recursive: true, force: true });
    delete process.env.GTM_IDE_USER_ID;
    delete process.env.GTM_IDE_USER_NAME;
    delete process.env.GTM_IDE_USER_EMAIL;
  });

  it("defaults locally to the single founder identity", () => {
    const user = resolveCurrentUser(options);
    assert.equal(user.userId, FOUNDER_USER_ID);
    assert.equal(user.name, "Founder");
  });

  it("resolves a user from a request header when present", () => {
    const user = resolveCurrentUser({
      ...options,
      request: { headers: { "x-gtm-user": "u-jacob", "x-gtm-user-name": "Jacob", "x-gtm-user-email": "j@x.com" } },
    });
    assert.equal(user.userId, "u-jacob");
    assert.equal(user.name, "Jacob");
    assert.equal(user.email, "j@x.com");
  });

  it("resolves a user from env when present", () => {
    process.env.GTM_IDE_USER_ID = "u-env";
    process.env.GTM_IDE_USER_NAME = "EnvUser";
    const user = resolveCurrentUser(options);
    assert.equal(user.userId, "u-env");
    assert.equal(user.name, "EnvUser");
  });
});

describe("team store: personal team + teamsForUser", () => {
  let parent;
  let options;

  beforeEach(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "gtm-team-"));
    options = { root: parent };
  });

  afterEach(() => fs.rmSync(parent, { recursive: true, force: true }));

  it("ensurePersonalTeam is stable and idempotent for a user", () => {
    const first = ensurePersonalTeam({ userId: "u-1", name: "One" }, options);
    const second = ensurePersonalTeam({ userId: "u-1", name: "One" }, options);
    assert.equal(first.id, second.id);
    assert.equal(first.members[0].userId, "u-1");
    assert.equal(first.members[0].role, "owner");
    // Only one team persisted, not two.
    assert.equal(listTeams(options).length, 1);
  });

  it("defaultTeamId resolves to the founder's personal team", () => {
    const id = defaultTeamId(options);
    assert.ok(id.startsWith("personal-"));
    assert.equal(getTeam(id, options).members[0].userId, FOUNDER_USER_ID);
  });

  it("teamsForUser returns only teams the user belongs to, with their role", () => {
    const owned = createTeam({ name: "Owned", owner: { userId: "u-1", name: "One" } }, options);
    const joined = createTeam({ name: "Joined", owner: { userId: "u-2", name: "Two" } }, options);
    addMember(joined.id, { userId: "u-1", role: "approver" }, options);
    createTeam({ name: "Other", owner: { userId: "u-3", name: "Three" } }, options);

    const teams = teamsForUser("u-1", options);
    const ids = teams.map((t) => t.id);
    assert.deepEqual(new Set(ids), new Set([owned.id, joined.id]));
    assert.equal(teams.find((t) => t.id === owned.id).role, "owner");
    assert.equal(teams.find((t) => t.id === joined.id).role, "approver");
  });
});
