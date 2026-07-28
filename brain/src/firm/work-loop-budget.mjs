// Daily participant spend accounting for the work loop. A capped drive reserves its maximum host-
// authorized charge before provider dispatch, then settles to measured (or conservative estimated)
// usage. A process stop leaves the reservation consuming the rail rather than silently making the
// same dollars available twice. The participant drive lease is the one writer for this ledger.

import crypto from "node:crypto";
import { PersistenceConflictError } from "../persistence.mjs";
import { getVentureDoc, now, safeId, venturePersistence } from "./venture-store.mjs";

export const UNMEASURED_DRIVE_ESTIMATE_USD = 0.25;

function utcDayKey(nowMs = Date.now()) {
  return new Date(nowMs).toISOString().slice(0, 10);
}

function spendKey(teammateRef) {
  return `daily-spend:${teammateRef}`;
}

export function getAgentDailySpend(ventureId, teammateRef, { nowMs = Date.now(), options = {} } = {}) {
  const day = utcDayKey(nowMs);
  const stored = getVentureDoc(ventureId, "crew", spendKey(teammateRef), options);
  const spentUsd = stored?.day === day && Number.isFinite(Number(stored.spentUsd))
    ? Math.max(0, Number(stored.spentUsd))
    : 0;
  const reservations = stored?.day === day && Array.isArray(stored.reservations)
    ? stored.reservations.filter((entry) => entry?.id && Number(entry.usd) > 0)
    : [];
  const reservedUsd = reservations.reduce((sum, entry) => sum + Number(entry.usd), 0);
  return { revision: Number.isInteger(stored?.revision) ? stored.revision : 0, day, spentUsd, reservedUsd, reservations };
}

function updateLedger(ventureId, teammateRef, { nowMs = Date.now(), options = {} } = {}, update) {
  getVentureDoc(ventureId, "configuration", "firm", options); // venture-scoped fail-closed read
  const provider = venturePersistence(options, ventureId);
  const key = safeId(spendKey(teammateRef));
  const legacy = provider.getFresh("crew", key);
  if (legacy && !Number.isInteger(legacy.revision)) provider.set("crew", key, { ...legacy, revision: 0 });
  while (true) {
    const current = getAgentDailySpend(ventureId, teammateRef, { nowMs, options });
    const nextValue = update(current);
    const next = { id: key, ...nextValue, revision: current.revision + 1, updatedAt: now() };
    try {
      return provider.compareAndSet("crew", key, current.revision, next);
    } catch (error) {
      if (error instanceof PersistenceConflictError) continue;
      throw error;
    }
  }
}

export function chargeAgentDailySpend(ventureId, teammateRef, usd, { nowMs = Date.now(), options = {} } = {}) {
  const charge = Number.isFinite(Number(usd)) ? Math.max(0, Number(usd)) : 0;
  return updateLedger(ventureId, teammateRef, { nowMs, options }, (ledger) => ({
    day: ledger.day, spentUsd: ledger.spentUsd + charge, reservations: ledger.reservations,
  }));
}

export function agentDailySpendAvailability({ ventureId, teammateRef, cap, costReporting, options, nowMs }) {
  if (cap == null) return { cap: null, spentUsd: 0, remainingUsd: null };
  const ledger = getAgentDailySpend(ventureId, teammateRef, { nowMs, options });
  const remainingUsd = Math.max(0, cap - ledger.spentUsd - ledger.reservedUsd);
  const minimum = costReporting === "usd" ? 0 : UNMEASURED_DRIVE_ESTIMATE_USD;
  if (remainingUsd <= 0 || remainingUsd < minimum) {
    const error = new Error(
      `${teammateRef} has reached the configured $${cap.toFixed(2)} daily spend limit. Change the firm configuration or wait until the next UTC day.`,
    );
    error.code = "agent_daily_spend_exhausted";
    error.status = 409;
    throw error;
  }
  return { cap, spentUsd: ledger.spentUsd, reservedUsd: ledger.reservedUsd, remainingUsd };
}

export function reserveAgentDailySpend({
  ventureId,
  teammateRef,
  cap,
  costReporting,
  options,
  nowMs,
  recoveryReservationId = null,
}) {
  if (cap == null) return { cap: null, spentUsd: 0, remainingUsd: null, reservation: null };
  if (recoveryReservationId) {
    const ledger = getAgentDailySpend(ventureId, teammateRef, { nowMs, options });
    const reservation = ledger.reservations.find((entry) => entry.id === recoveryReservationId);
    if (!reservation) {
      const error = new Error(`Recovery spend reservation ${recoveryReservationId} is no longer active.`);
      error.code = "agent_spend_reservation_missing";
      throw error;
    }
    return {
      cap,
      spentUsd: ledger.spentUsd,
      reservedUsd: ledger.reservedUsd,
      remainingUsd: reservation.usd,
      reservation,
    };
  }
  let result = null;
  updateLedger(ventureId, teammateRef, { nowMs, options }, (ledger) => {
    const remainingUsd = Math.max(0, cap - ledger.spentUsd - ledger.reservedUsd);
    const minimum = costReporting === "usd" ? 0 : UNMEASURED_DRIVE_ESTIMATE_USD;
    if (remainingUsd <= 0 || remainingUsd < minimum) {
      const error = new Error(`${teammateRef} has reached the configured $${cap.toFixed(2)} daily spend limit.`);
      error.code = "agent_daily_spend_exhausted";
      error.status = 409;
      throw error;
    }
    const usd = costReporting === "usd" ? remainingUsd : Math.min(UNMEASURED_DRIVE_ESTIMATE_USD, remainingUsd);
    const reservation = { id: crypto.randomUUID(), usd, createdAt: now() };
    result = { cap, spentUsd: ledger.spentUsd, reservedUsd: ledger.reservedUsd, remainingUsd: usd, reservation };
    return { day: ledger.day, spentUsd: ledger.spentUsd, reservations: [...ledger.reservations, reservation] };
  });
  return result;
}

export function bindAgentDailySpendReservation({
  ventureId,
  teammateRef,
  reservation,
  runRef,
  machineRef,
  options,
  nowMs,
}) {
  if (!reservation) return null;
  let bound = null;
  updateLedger(ventureId, teammateRef, { nowMs, options }, (ledger) => ({
    day: ledger.day,
    spentUsd: ledger.spentUsd,
    reservations: ledger.reservations.map((entry) => {
      if (entry.id !== reservation.id) return entry;
      bound = { ...entry, runRef, machineRef };
      return bound;
    }),
  }));
  if (!bound) {
    const error = new Error(`Daily spend reservation ${reservation.id} is no longer active.`);
    error.code = "agent_spend_reservation_missing";
    throw error;
  }
  return bound;
}

export function settleAgentDailySpend({ ventureId, teammateRef, reservation, usd, options, nowMs }) {
  if (!reservation) return null;
  const charge = Number.isFinite(Number(usd)) ? Math.max(0, Number(usd)) : 0;
  return updateLedger(ventureId, teammateRef, { nowMs, options }, (ledger) => {
    const existing = ledger.reservations.find((entry) => entry.id === reservation.id);
    if (!existing) {
      const error = new Error(`Daily spend reservation ${reservation.id} is no longer active.`);
      error.code = "agent_spend_reservation_missing";
      throw error;
    }
    return { day: ledger.day, spentUsd: ledger.spentUsd + charge, reservations: ledger.reservations.filter((entry) => entry.id !== reservation.id) };
  });
}
