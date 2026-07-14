import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { CrewFace } from "./CrewFace";

describe("CrewFace", () => {
  it("renders the crew character by default", () => {
    const { container } = render(<CrewFace agentRef="scout" />);
    expect(container.querySelector(".crew-face")).toBeTruthy();
    expect(container.querySelector(".crew-avatar")).toBeTruthy();
  });
});
