// Durable, per-resource serialization for provider drives.
//
// One CAS document atomically claims both the configured participant and the resume record the
// drive will write. This permits unrelated participants to work together while preventing both
// daily-spend races and last-write-wins resume state. A crashed process leaves an honest durable
// lease. Ambient work cannot steal it after restart; only a fresh founder/agent direction may
// reclaim it, and the caller receives that recovery fact so the resume record can name the stop.

import crypto from "node:crypto";
import { PersistenceConflictError } from "../persistence.mjs";
import { getVentureDoc, now, venturePersistence } from "./venture-store.mjs";

export const DRIVE_LEASES_KEY = "participant-drive-leases";
const PROCESS_INSTANCE_ID = crypto.randomUUID();
const DEFAULT_WAIT_MS = 10 * 60 * 1000;
const POLL_MS = 15;

function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  if (pid === process.pid) return true;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

function blankRegistry() {
  return { id: DRIVE_LEASES_KEY, revision: 0, resources: {}, interruptions: [] };
}

function registry(provider) {
  const stored = provider.getFresh("crew", DRIVE_LEASES_KEY);
  return stored ?? blankRegistry();
}

function resourcesFor(teammateRef, betId, workScopeRef) {
  return [betId
    ? `resume:bet:${betId}`
    : workScopeRef
      ? `resume:${workScopeRef}`
      : `resume:participant:${teammateRef}`];
}

function conflictOwners(state, resources) {
  const byLease = new Map();
  for (const resource of resources) {
    const owner = state.resources?.[resource];
    if (owner?.leaseId) byLease.set(owner.leaseId, owner);
  }
  return [...byLease.values()];
}

function ownerAlive(owner, deps) {
  if (owner.processInstanceId === PROCESS_INSTANCE_ID) return true;
  return (deps.leaseOwnerAlive ?? processIsAlive)(owner.pid);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cas(provider, state, resources, interruptions = state.interruptions ?? []) {
  return provider.compareAndSet("crew", DRIVE_LEASES_KEY, state.revision, {
    id: DRIVE_LEASES_KEY,
    revision: state.revision + 1,
    resources,
    interruptions: interruptions.slice(-20),
    updatedAt: now(),
  });
}

async function acquire({ ventureId, teammateRef, betId, workScopeRef, explicitContinuation, options, deps }) {
  getVentureDoc(ventureId, "configuration", "firm", options); // fail closed before writing a lease
  const provider = venturePersistence(options, ventureId);
  const requested = resourcesFor(teammateRef, betId, workScopeRef);
  const deadline = Date.now() + (deps.driveLeaseWaitMs ?? DEFAULT_WAIT_MS);

  while (true) {
    const state = registry(provider);
    const owners = conflictOwners(state, requested);
    const interrupted = owners.filter((owner) => !ownerAlive(owner, deps));
    if (interrupted.length && !explicitContinuation) {
      const error = new Error(
        `${teammateRef}'s previous work was interrupted. Continue it explicitly before automatic work can resume.`,
      );
      error.code = "participant_drive_interrupted";
      error.status = 409;
      throw error;
    }

    if (!owners.length || (interrupted.length === owners.length && explicitContinuation)) {
      const leaseId = crypto.randomUUID();
      const acquiredAt = now();
      const recoveredLeaseIds = interrupted.map((owner) => owner.leaseId);
      const nextResources = { ...(state.resources ?? {}) };
      for (const owner of interrupted) {
        for (const [resource, candidate] of Object.entries(nextResources)) {
          if (candidate?.leaseId === owner.leaseId) delete nextResources[resource];
        }
      }
      const owner = { leaseId, pid: process.pid, processInstanceId: PROCESS_INSTANCE_ID, acquiredAt };
      for (const resource of requested) nextResources[resource] = owner;
      const interruptions = recoveredLeaseIds.length
        ? [...(state.interruptions ?? []), { leaseIds: recoveredLeaseIds, resources: requested, detectedAt: acquiredAt }]
        : (state.interruptions ?? []);
      try {
        const claimed = cas(provider, state, nextResources, interruptions);
        return { id: leaseId, resources: requested, recoveredLeaseIds, revision: claimed.revision };
      } catch (error) {
        if (error instanceof PersistenceConflictError) continue;
        throw error;
      }
    }

    if (Date.now() >= deadline) {
      const error = new Error(`${teammateRef} already has provider work in progress.`);
      error.code = "participant_drive_busy";
      error.status = 409;
      throw error;
    }
    await wait(Math.min(POLL_MS, Math.max(1, deadline - Date.now())));
  }
}

function release({ ventureId, lease, options }) {
  const provider = venturePersistence(options, ventureId);
  while (true) {
    const state = registry(provider);
    const nextResources = { ...(state.resources ?? {}) };
    let owned = false;
    for (const [resource, owner] of Object.entries(nextResources)) {
      if (owner?.leaseId !== lease.id) continue;
      owned = true;
      delete nextResources[resource];
    }
    if (!owned) return;
    try {
      cas(provider, state, nextResources);
      return;
    } catch (error) {
      if (error instanceof PersistenceConflictError) continue;
      throw error;
    }
  }
}

export async function withParticipantDriveLease({
  ventureId,
  teammateRef,
  betId = null,
  workScopeRef = null,
  explicitContinuation = false,
  options = {},
  deps = {},
}, drive) {
  const lease = await acquire({ ventureId, teammateRef, betId, workScopeRef, explicitContinuation, options, deps });
  try {
    return await drive(lease);
  } finally {
    release({ ventureId, lease, options });
  }
}
