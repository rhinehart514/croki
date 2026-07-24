import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SystemIndexObject } from "@/api";
import type { FirmConfiguration, FirmCrewMember } from "@/types";
import { ProductPalette } from "./ProductPalette";

vi.mock("@/components/crew/CrewFace", () => ({ CrewFace: () => <span data-testid="agent-logo" /> }));

const crew = [{ ref: "agent:research", soul: { name: "Researcher" } }] as FirmCrewMember[];
const configuration = {
  agents: [{ ref: "agent:research", name: "Researcher", perspective: "Find attributable market evidence." }],
} as FirmConfiguration;

const outreach = { id: "outreach", objectRef: "object:outreach", name: "Founder email outreach", statement: "Send the message and watch for a reply.", type: "workflow", territory: "gtm", assertion: "founder-asserted", provenance: null, properties: {}, compatibilityOwned: false, architectureRole: null, threadRefs: [], attention: [], createdAt: null, updatedAt: null } as SystemIndexObject;

describe("ProductPalette — Canvas agents and capabilities", () => {
  it("uses logo-led pills with explicit human-readable kinds", () => {
    render(<ProductPalette
      ventureId="v1"
      objects={[]}
      crew={crew}
      configuration={configuration}
      capabilities={[
        { id: "README.md", label: "README.md", provider: "native", kind: "markdown", authority: "read", status: "available", detail: "Product source", relevance: { atRest: true } },
        { id: "browser", label: "Browser", provider: "native", kind: "tool", authority: "read", status: "available", detail: "Inspect the web", relevance: { atRest: true } },
      ]}
      selectedObject={null}
      readOnlyReason={null}
      onUseAgent={vi.fn()}
      onConfigurationChanged={vi.fn()}
    />);

    expect(screen.getByRole("button", { name: "Researcher, Agent, Inward access" })).toHaveClass("product-palette-pill");
    expect(screen.getByRole("button", { name: "README.md, Markdown, Read access" })).toHaveClass("product-palette-pill");
    expect(screen.getByRole("button", { name: "Browser, Tool, Read access" })).toHaveClass("product-palette-pill");
    expect(screen.getByTestId("agent-logo")).toBeInTheDocument();
  });

  it("keeps release navigation and fixed pipeline state out of the palette", () => {
    render(<ProductPalette
      ventureId="v1" objects={[]} crew={crew} configuration={configuration} capabilities={[]}
      selectedObject={null} readOnlyReason={null}
      onUseAgent={vi.fn()} onConfigurationChanged={vi.fn()}
    />);

    expect(screen.queryByText("Releases")).not.toBeInTheDocument();
    expect(screen.queryByText("Prepare release")).not.toBeInTheDocument();
    expect(screen.queryByText("In market")).not.toBeInTheDocument();
  });

  it("shows only capabilities relevant to the selected object and states reconnect access honestly", () => {
    render(<ProductPalette
      ventureId="v1" objects={[outreach]} crew={[]} configuration={configuration}
      capabilities={[
        { id: "repository", label: "Repository", provider: "native", kind: "workspace", authority: "inward", status: "available", detail: "Product workspace", relevance: { atRest: true } },
        { id: "gmail.read", label: "Gmail Read", provider: "gmail", kind: "source", authority: "read", status: "reconnect", detail: "Reconnect Gmail", relevance: { territories: ["gtm"], terms: ["email", "reply"] } },
        { id: "gmail.send", label: "Gmail Send", provider: "gmail", kind: "action", authority: "founder-gate", status: "reconnect", detail: "Reconnect Gmail", relevance: { territories: ["gtm"], terms: ["email", "send"] } },
        { id: "exa.search", label: "Exa Search", provider: "exa", kind: "source", authority: "read", status: "available", detail: "Search the web", relevance: { terms: ["research"] } },
      ]}
      selectedObject={outreach} readOnlyReason={null}
      onUseAgent={vi.fn()} onConfigurationChanged={vi.fn()}
    />);

    const gmailRead = screen.getByRole("button", { name: "Gmail Read, Source, Read access, Reconnect" });
    expect(gmailRead).toHaveAttribute("aria-disabled", "true");
    expect(gmailRead).toHaveAttribute("draggable", "false");
    expect(screen.getByRole("button", { name: "Gmail Send, Action, Approval access, Reconnect" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Exa Search/ })).not.toBeInTheDocument();
  });
});
