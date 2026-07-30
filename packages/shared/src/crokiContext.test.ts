import { describe, expect, it } from "vite-plus/test";
import {
  buildCrokiAgentContext,
  createEmptyCrokiContext,
  parseCrokiContext,
  prependCrokiAgentContext,
  serializeCrokiContext,
} from "./crokiContext.js";

describe("Croki product context", () => {
  it("round trips the repository format", () => {
    const empty = createEmptyCrokiContext("Croki");
    expect(parseCrokiContext(serializeCrokiContext(empty))).toEqual(empty);
  });

  it("rejects relationships to missing nodes", () => {
    expect(() =>
      parseCrokiContext(
        JSON.stringify({
          version: 1,
          product: "Croki",
          updatedAt: "2026-07-29T00:00:00.000Z",
          nodes: [],
          edges: [{ from: "missing", to: "also-missing", relation: "supports" }],
        }),
      ),
    ).toThrow(/existing nodes/);
  });

  it("omits retired truth from agent context", () => {
    const prompt = buildCrokiAgentContext({
      version: 1,
      product: "Croki",
      updatedAt: "2026-07-29T00:00:00.000Z",
      nodes: [
        {
          id: "intent-1",
          kind: "intent",
          status: "current",
          title: "Keep product truth durable",
          body: "",
          updatedAt: "2026-07-29T00:00:00.000Z",
        },
        {
          id: "old-1",
          kind: "decision",
          status: "retired",
          title: "Old architecture",
          body: "",
          updatedAt: "2026-07-29T00:00:00.000Z",
        },
      ],
      edges: [],
    });
    expect(prompt).toContain("Keep product truth durable");
    expect(prompt).not.toContain("Old architecture");
  });

  it("prepends context without changing the user's stored message", () => {
    const userInput = "Build the next slice";
    expect(
      prependCrokiAgentContext("<croki_product_context>truth</croki_product_context>", userInput),
    ).toBe("<croki_product_context>truth</croki_product_context>\n\nBuild the next slice");
    expect(userInput).toBe("Build the next slice");
  });
});
