import { describe, expect, it } from "vitest";
import { resolveCanvasInitialFocus, type CanvasInitialFocusInput } from "./canvasInitialFocus";

type Focus = { kind: "anchor" | "lane"; id: string };

const focus = (id: string): Focus => ({ kind: "anchor", id });
const candidate = (id: string, occurredAt: string | null) => ({ id, focus: focus(id), occurredAt });
const visibleViewport = {
  savedViewport: { x: 0, y: 0, zoom: 1 },
  viewportSize: { width: 1200, height: 760 },
  canvasObjects: [{ x: 100, y: 80, width: 220, height: 96 }],
} satisfies Partial<CanvasInitialFocusInput<Focus>>;

describe("resolveCanvasInitialFocus", () => {
  it("honors the complete precedence order", () => {
    const full: CanvasInitialFocusInput<Focus> = {
      explicitFocus: focus("explicit"),
      restoredFocus: focus("restored"),
      ...visibleViewport,
      unresolvedReplies: [candidate("reply", "2026-07-13T12:00:00Z")],
      outcomes: [
        { ...candidate("response", "2026-07-13T11:00:00Z"), kind: "observed-response" },
        { ...candidate("business", "2026-07-13T10:00:00Z"), kind: "business-outcome" },
        { ...candidate("remaining", "2026-07-13T13:00:00Z"), kind: "founder-entered" },
      ],
      parkedGates: [candidate("gate", "2026-07-13T09:00:00Z")],
    };

    expect(resolveCanvasInitialFocus(full)).toMatchObject({ source: "explicit", focus: focus("explicit") });
    expect(resolveCanvasInitialFocus({ ...full, explicitFocus: null })).toMatchObject({ source: "restored", focus: focus("restored") });
    expect(resolveCanvasInitialFocus({ ...full, explicitFocus: null, restoredFocus: null })).toMatchObject({ source: "saved-viewport" });
    expect(resolveCanvasInitialFocus({ ...full, explicitFocus: null, restoredFocus: null, savedViewport: null })).toMatchObject({ source: "unresolved-reply", focus: focus("reply") });
    expect(resolveCanvasInitialFocus({ ...full, explicitFocus: null, restoredFocus: null, savedViewport: null, unresolvedReplies: [] })).toMatchObject({ source: "observed-response", focus: focus("response") });
    expect(resolveCanvasInitialFocus({ ...full, explicitFocus: null, restoredFocus: null, savedViewport: null, unresolvedReplies: [], outcomes: full.outcomes?.filter((outcome) => outcome.kind !== "observed-response") })).toMatchObject({ source: "business-or-product-outcome", focus: focus("business") });
    expect(resolveCanvasInitialFocus({ ...full, explicitFocus: null, restoredFocus: null, savedViewport: null, unresolvedReplies: [], outcomes: full.outcomes?.filter((outcome) => outcome.kind === "founder-entered") })).toMatchObject({ source: "parked-gate", focus: focus("gate") });
    expect(resolveCanvasInitialFocus({ ...full, explicitFocus: null, restoredFocus: null, savedViewport: null, unresolvedReplies: [], parkedGates: [], outcomes: full.outcomes?.filter((outcome) => outcome.kind === "founder-entered") })).toMatchObject({ source: "latest-outcome", focus: focus("remaining") });
    expect(resolveCanvasInitialFocus({})).toEqual({ kind: "overview", source: "overview" });
  });

  it("rejects a corrupt or off-canvas saved viewport", () => {
    const replies = [candidate("reply", "2026-07-13T12:00:00Z")];

    expect(resolveCanvasInitialFocus({
      ...visibleViewport,
      savedViewport: { x: 0, y: 0, zoom: 0.1 },
      unresolvedReplies: replies,
    })).toMatchObject({ source: "unresolved-reply" });

    expect(resolveCanvasInitialFocus({
      ...visibleViewport,
      savedViewport: { x: -5000, y: -5000, zoom: 1 },
      unresolvedReplies: replies,
    })).toMatchObject({ source: "unresolved-reply" });
  });

  it("uses real timestamps, then stable ids, instead of array order", () => {
    expect(resolveCanvasInitialFocus({
      unresolvedReplies: [
        candidate("older", "2026-07-12T23:59:59-04:00"),
        candidate("newer", "2026-07-13T04:00:00Z"),
      ],
    })).toMatchObject({ focus: focus("newer") });

    expect(resolveCanvasInitialFocus({
      parkedGates: [candidate("z-gate", "not-a-date"), candidate("a-gate", null)],
    })).toMatchObject({ focus: focus("a-gate") });
  });

  it("selects outcomes only by authoritative kind, never by suggestive text", () => {
    expect(resolveCanvasInitialFocus({
      outcomes: [
        { ...candidate("warm-looking", "2026-07-13T14:00:00Z"), kind: "sent" },
        { ...candidate("observed", "2026-07-13T13:00:00Z"), kind: "observed-response" },
        { ...candidate("product", "2026-07-13T15:00:00Z"), kind: "product-activation" },
      ],
    })).toMatchObject({ source: "observed-response", focus: focus("observed") });

    expect(resolveCanvasInitialFocus({
      outcomes: [
        { ...candidate("founder-entered", "2026-07-13T16:00:00Z"), kind: "founder-entered" },
        { ...candidate("product", "2026-07-13T15:00:00Z"), kind: "product-activation" },
      ],
    })).toMatchObject({ source: "business-or-product-outcome", focus: focus("product") });
  });
});
