// Daily participant spend accounting for the work loop. A capped drive reserves its maximum host-
// authorized charge before provider dispatch, then settles to measured (or conservative estimated)
// usage. A process stop leaves the reservation consuming the rail rather than silently making the
// same dollars available twice. The participant drive lease is the one writer for this ledger.

import crypto from "node:crypto";
import { getVentureDoc, setVentureDoc, now } from "./venture-store.mjs";

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
  return { day, spentUsd, reservedUsd, reservations };
}

function writeLedger(ventureId, teammateRef, ledger, options) {
  const next = { id: spendKey(teammateRef), ...ledger, updatedAt: now() };
  setVentureDoc(ventureId, "crew", spendKey(teammateRef), next, options);
  return next;
}

export function chargeAgentDailySpend(ventureId, teammateRef, usd, { nowMs = Date.now(), options = {} } = {}) {
  const ledger = getAgentDailySpend(ventureId, teammateRef, { nowMs, options });
  const charge = Number.isFinite(Number(usd)) ? Math.max(0, Number(usd)) : 0;
  return writeLedger(ventureId, teammateRef, {
    day: ledger.day,
    spentUsd: ledger.spentUsd + charge,
    reservations: ledger.reservations,
  }, options);
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

export function reserveAgentDailySpend({ ventureId, teammateRef, cap, costReporting, options, nowMs }) {
  const availability = agentDailySpendAvailability({ ventureId, teammateRef, cap, costReporting, options, nowMs });
  if (cap == null) return { ...availability, reservation: null };
  const usd = costReporting === "usd"
    ? availability.remainingUsd
    : Math.min(UNMEASURED_DRIVE_ESTIMATE_USD, availability.remainingUsd);
  const ledger = getAgentDailySpend(ventureId, teammateRef, { nowMs, options });
  const reservation = { id: crypto.randomUUID(), usd, createdAt: now() };
  writeLedger(ventureId, teammateRef, {
    day: ledger.day,
    spentUsd: ledger.spentUsd,
    reservations: [...ledger.reservations, reservation],
  }, options);
  return { ...availability, remainingUsd: usd, reservation };
}

export function settleAgentDailySpend({ ventureId, teammateRef, reservation, usd, options, nowMs }) {
  if (!reservation) return null;
  const ledger = getAgentDailySpend(ventureId, teammateRef, { nowMs, options });
  const existing = ledger.reservations.find((entry) => entry.id === reservation.id);
  if (!existing) {
    const error = new Error(`Daily spend reservation ${reservation.id} is no longer active.`);
    error.code = "agent_spend_reservation_missing";
    throw error;
  }
  const charge = Number.isFinite(Number(usd)) ? Math.max(0, Number(usd)) : 0;
  return writeLedger(ventureId, teammateRef, {
    day: ledger.day,
    spentUsd: ledger.spentUsd + charge,
    reservations: ledger.reservations.filter((entry) => entry.id !== reservation.id),
  }, options);
}
