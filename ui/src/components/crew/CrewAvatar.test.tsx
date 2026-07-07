import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { CrewAvatar } from "./CrewAvatar";

// The whole rendered element: the chip wrapper (carries the family tint) plus the seeded avatar SVG.
function markup(props: React.ComponentProps<typeof CrewAvatar>): string {
  const { container } = render(<CrewAvatar {...props} />);
  return (container.firstElementChild as HTMLElement).outerHTML;
}

// Just the avatar SVG, independent of the chip — this is the part keyed to the agent's ref.
function faceMarkup(props: React.ComponentProps<typeof CrewAvatar>): string {
  const { container } = render(<CrewAvatar {...props} />);
  return container.querySelector("svg")!.outerHTML;
}

describe("CrewAvatar determinism", () => {
  it("renders the identical avatar for the same ref every time", () => {
    const a = faceMarkup({ agentRef: "gtm-find-prospects", family: "research" });
    const b = faceMarkup({ agentRef: "gtm-find-prospects", family: "research" });
    expect(a).toBe(b);
  });

  it("has no randomness: repeated renders across many refs stay stable", () => {
    const refs = ["cold-outreach", "gtm-enrich", "vouch-writer", "rodentradar-signal"];
    for (const ref of refs) {
      expect(faceMarkup({ agentRef: ref, family: "write" })).toBe(
        faceMarkup({ agentRef: ref, family: "write" }),
      );
    }
  });

  it("gives two different agents a distinct face", () => {
    const one = faceMarkup({ agentRef: "prospect-scout-a", family: "research" });
    const two = faceMarkup({ agentRef: "prospect-scout-b", family: "research" });
    expect(one).not.toBe(two);
  });

  it("keeps the face keyed to the ref, not the family (character is identity, family is the chip)", () => {
    const asResearch = faceMarkup({ agentRef: "shared-ref", family: "research" });
    const asWrite = faceMarkup({ agentRef: "shared-ref", family: "write" });
    expect(asResearch).toBe(asWrite);
  });

  it("carries the family on the chip: same ref, different family reads differently overall", () => {
    const asResearch = markup({ agentRef: "shared-ref", family: "research" });
    const asWrite = markup({ agentRef: "shared-ref", family: "write" });
    expect(asResearch).not.toBe(asWrite);
  });

  it("adds the working-state class only when working", () => {
    expect(markup({ agentRef: "x", family: "general", state: "idle" })).not.toContain(
      "crew-avatar--working",
    );
    expect(markup({ agentRef: "x", family: "general", state: "working" })).toContain(
      "crew-avatar--working",
    );
  });
});
