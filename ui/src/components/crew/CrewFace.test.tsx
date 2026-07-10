import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { CrewFace } from "./CrewFace";

describe("CrewFace", () => {
  it("renders the crew character by default", () => {
    const { container } = render(<CrewFace agentRef="scout" job="Prospect Researcher" />);
    expect(container.querySelector(".crew-face")).toBeTruthy();
    expect(container.querySelector(".crew-avatar")).toBeTruthy();
    expect(container.querySelector(".crew-roundel")).toBeNull();
  });

  it("still supports a monogram roundel when a compact surface opts in", () => {
    const { container } = render(<CrewFace agentRef="scout" variant="roundel" />);
    expect(container.querySelector(".crew-roundel")).toBeTruthy();
    expect(container.querySelector(".crew-roundel-mono")?.textContent?.length).toBeGreaterThan(0);
    expect(container.querySelector(".crew-face")).toBeNull();
  });
});
