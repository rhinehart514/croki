import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WorkspaceModeNav, type ModeAttention } from "./WorkspaceModeNav";

const attention = (work: Partial<ModeAttention>, gtm: Partial<ModeAttention> = {}): Record<"work" | "product-gtm", ModeAttention> => ({
  work: { needsYou: 0, active: 0, ...work },
  "product-gtm": { needsYou: 0, active: 0, ...gtm },
});

describe("WorkspaceModeNav attention badges", () => {
  it("shows a needs-you count on the mode with founder-blocking work", () => {
    render(<WorkspaceModeNav mode="product-gtm" animate={false} attention={attention({ needsYou: 2, active: 3 })} onMode={() => {}} />);
    // Needs-you wins over a running pulse and carries the exact count in words.
    expect(screen.getByLabelText("2 in Work need you")).toHaveTextContent("2");
  });

  it("singularises the needs-you label for one thread", () => {
    render(<WorkspaceModeNav mode="product-gtm" animate={false} attention={attention({ needsYou: 1 })} onMode={() => {}} />);
    expect(screen.getByLabelText("1 in Work needs you")).toBeInTheDocument();
  });

  it("shows a quiet running signal when work is active but nothing is blocked", () => {
    render(<WorkspaceModeNav mode="product-gtm" animate={false} attention={attention({ active: 1 })} onMode={() => {}} />);
    expect(screen.getByLabelText("Work is running")).toBeInTheDocument();
    expect(screen.queryByLabelText(/need you/)).not.toBeInTheDocument();
  });

  it("stays silent when nothing needs the founder", () => {
    render(<WorkspaceModeNav mode="work" animate={false} attention={attention({})} onMode={() => {}} />);
    expect(screen.queryByLabelText(/need you|is running/)).not.toBeInTheDocument();
  });
});
