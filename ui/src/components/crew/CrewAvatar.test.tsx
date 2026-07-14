import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { CrewAvatar } from "./CrewAvatar";

// The whole rendered element: the chip wrapper plus the seeded avatar SVG.
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
    const a = faceMarkup({ agentRef: "gtm-find-prospects" });
    const b = faceMarkup({ agentRef: "gtm-find-prospects" });
    expect(a).toBe(b);
  });

  it("has no randomness: repeated renders across many refs stay stable", () => {
    const refs = ["cold-outreach", "gtm-enrich", "vouch-writer", "rodentradar-signal"];
    for (const ref of refs) {
      expect(faceMarkup({ agentRef: ref })).toBe(
        faceMarkup({ agentRef: ref }),
      );
    }
  });

  it("gives two different agents a distinct face", () => {
    const one = faceMarkup({ agentRef: "prospect-scout-a" });
    const two = faceMarkup({ agentRef: "prospect-scout-b" });
    expect(one).not.toBe(two);
  });

  it("adds the working-state class only when working", () => {
    expect(markup({ agentRef: "x", state: "idle" })).not.toContain(
      "crew-avatar--working",
    );
    expect(markup({ agentRef: "x", state: "working" })).toContain(
      "crew-avatar--working",
    );
  });
});
