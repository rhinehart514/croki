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
  return container.querySelector("svg")!.outerHTML.replace(
    /crew-avatar-[a-z0-9_-]+--/gi,
    "crew-avatar-instance--",
  );
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

  it("keeps generator provenance out of the visible interface", () => {
    const { container } = render(<CrewAvatar agentRef="evidence-reviewer" />);
    expect(container.textContent).toBe("");
    expect(container.querySelector("metadata")).toBeNull();
    expect(container.innerHTML).not.toContain("creativecommons.org");
  });

  it("keeps every generated SVG id and reference local when the same face repeats", () => {
    const { container } = render(<>
      <CrewAvatar agentRef="repeated-scout" />
      <CrewAvatar agentRef="repeated-scout" />
      <CrewAvatar agentRef="repeated-scout" />
    </>);
    const avatars = [...container.querySelectorAll("svg")];
    const ids = avatars.flatMap((avatar) => [...avatar.querySelectorAll<SVGElement>("[id]")].map((node) => node.id));

    expect(new Set(ids).size).toBe(ids.length);
    for (const avatar of avatars) {
      const localIds = new Set([...avatar.querySelectorAll<SVGElement>("[id]")].map((node) => node.id));
      const references = avatar.outerHTML.matchAll(/(?:url\(#|href="#)([^)"]+)/g);
      for (const reference of references) expect(localIds.has(reference[1])).toBe(true);
    }
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
