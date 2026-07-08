// Crew roster — the teammates a founder has ADDED to a project but may not have used in a pipeline yet.
// The bench is otherwise derived purely from pipelines + the run ledger (project-store getAgentBench), so
// a brand-new teammate would be invisible until its first run. This tiny per-project roster holds those
// added-but-unused refs so a freshly built teammate shows up on the crew the instant it's created. It is
// additive only: once an agent appears in a pipeline or a run the derived crew carries it regardless, and
// a ref listed here that no longer resolves to a file simply reads as an empty bench row.
import { persistence } from "./persistence.mjs";
import { safeId, now } from "./store-fs.mjs";

const COLLECTION = "crew-roster";

function normalizeMember(input) {
  const ref = typeof input?.ref === "string" ? input.ref.trim() : "";
  if (!ref) return null;
  return {
    ref,
    name: typeof input?.name === "string" ? input.name.trim() : "",
    description: typeof input?.description === "string" ? input.description.trim() : "",
    addedAt: input?.addedAt || now(),
  };
}

export const crewRosterStore = {
  collection: COLLECTION,
  load(projectId = "default", options = {}) {
    const stored = persistence(options).get(COLLECTION, safeId(projectId));
    const members = Array.isArray(stored?.members) ? stored.members.map(normalizeMember).filter(Boolean) : [];
    return { projectId, members, updatedAt: stored?.updatedAt ?? null };
  },
  add(projectId = "default", member, options = {}) {
    const normalized = normalizeMember(member);
    if (!normalized) throw new Error("A crew member needs a ref.");
    const current = this.load(projectId, options);
    const members = [...current.members.filter((m) => m.ref !== normalized.ref), normalized];
    const value = { projectId, members, updatedAt: now() };
    persistence(options).set(COLLECTION, safeId(projectId), value);
    return value;
  },
  remove(projectId = "default", ref, options = {}) {
    const current = this.load(projectId, options);
    const value = { projectId, members: current.members.filter((m) => m.ref !== ref), updatedAt: now() };
    persistence(options).set(COLLECTION, safeId(projectId), value);
    return value;
  },
};
