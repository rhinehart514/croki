import { expect, it } from "@effect/vitest";
import type { CrokiContext } from "@t3tools/shared/crokiContext";

import { applyCrokiCanvasPresentation } from "./presentation.ts";

const NOW = "2026-07-31T18:00:00.000Z";
const NEXT = "2026-07-31T18:05:00.000Z";
const context: CrokiContext = {
  version: 1,
  product: "Croki",
  updatedAt: NOW,
  nodes: [
    {
      id: "founder-intent",
      kind: "intent",
      status: "current",
      domain: "product",
      origin: "founder",
      title: "Keep product judgment near the work",
      body: "Canvas is part of the Thread.",
      updatedAt: NOW,
    },
    {
      id: "agent-claim",
      kind: "decision",
      status: "provisional",
      domain: "gtm",
      origin: "agent",
      title: "Old claim",
      body: "Old reasoning",
      updatedAt: NOW,
    },
  ],
  edges: [{ from: "agent-claim", to: "founder-intent", relation: "old-relation" }],
};

it("presents a complete agent scene without mutating founder authority or persisting layout", () => {
  const next = applyCrokiCanvasPresentation(
    context,
    {
      view: "gtm",
      question: "Which founder should Croki serve first?",
      nodes: [
        {
          id: "agent-claim",
          kind: "decision",
          title: "Continuity is the wedge",
          body: "Serial founders lose judgment between coding sessions.",
        },
        {
          id: "agent-signal",
          kind: "evidence",
          domain: "shared",
          title: "Repository continuity model exists",
          body: "Context is compiled into every relevant turn.",
          references: [
            { kind: "file", path: "packages/shared/src/crokiContextRendering.ts", line: 15 },
          ],
        },
      ],
      edges: [
        { from: "agent-signal", to: "agent-claim", relation: "supports" },
        { from: "agent-claim", to: "founder-intent", relation: "serves" },
      ],
    },
    NEXT,
  );

  expect(next.nodes[0]).toEqual(context.nodes[0]);
  expect(next.nodes.find((node) => node.id === "agent-claim")).toMatchObject({
    status: "provisional",
    domain: "gtm",
    origin: "agent",
    title: "Continuity is the wedge",
    updatedAt: NEXT,
  });
  expect(next.nodes.find((node) => node.id === "agent-signal")).toMatchObject({
    status: "provisional",
    domain: "shared",
    origin: "agent",
  });
  expect(next.edges).toEqual([
    { from: "agent-signal", to: "agent-claim", relation: "supports" },
    { from: "agent-claim", to: "founder-intent", relation: "serves" },
  ]);
  expect(next.nodes.some((node) => "position" in node)).toBe(false);
});

it("refuses to overwrite founder-approved records or accept ungrounded relationships", () => {
  expect(() =>
    applyCrokiCanvasPresentation(
      context,
      {
        view: "product",
        question: "Change canon",
        nodes: [
          {
            id: "founder-intent",
            kind: "intent",
            title: "Agent replacement",
          },
        ],
        edges: [],
      },
      NEXT,
    ),
  ).toThrow(/belongs to founder or repository context/);

  expect(() =>
    applyCrokiCanvasPresentation(
      context,
      {
        view: "product",
        question: "Invent a relationship",
        nodes: [{ id: "agent-new", kind: "work", title: "A consequence" }],
        edges: [{ from: "agent-new", to: "missing", relation: "depends-on" }],
      },
      NEXT,
    ),
  ).toThrow(/references a missing item/);
});

it("refuses to create relationships solely between founder-owned records", () => {
  expect(() =>
    applyCrokiCanvasPresentation(
      {
        ...context,
        nodes: [
          ...context.nodes,
          {
            id: "founder-evidence",
            kind: "evidence",
            status: "current",
            origin: "founder",
            title: "Founder evidence",
            body: "",
            updatedAt: NOW,
          },
        ],
      },
      {
        view: "product",
        question: "What changed?",
        nodes: [{ id: "agent-new", kind: "decision", title: "A proposal" }],
        edges: [
          {
            from: "founder-evidence",
            to: "founder-intent",
            relation: "supports",
          },
        ],
      },
      NEXT,
    ),
  ).toThrow(/must touch an agent-authored proposal/);
});

it("keeps every presented node inside the focused view or shared context", () => {
  expect(() =>
    applyCrokiCanvasPresentation(
      context,
      {
        view: "product",
        question: "What should the founder judge?",
        nodes: [
          {
            id: "agent-market-claim",
            kind: "decision",
            domain: "gtm",
            title: "A claim outside the presented view",
          },
        ],
        edges: [],
      },
      NEXT,
    ),
  ).toThrow(/must belong to the presented view or be shared/);
});
