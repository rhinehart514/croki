import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { FirmConfiguration, FirmCrewMember } from "@/types";
import { WorkspaceRailBody } from "./WorkspaceRailBody";

vi.mock("@/components/crew/CrewFace", () => ({ CrewFace: () => <span data-testid="agent-logo" /> }));

const crew = [{ ref: "agent:research", soul: { name: "Researcher" } }] as FirmCrewMember[];
const configuration = {
  agents: [{ ref: "agent:research", name: "Researcher", perspective: "Find attributable market evidence." }],
} as FirmConfiguration;

describe("WorkspaceRailBody Product / GTM palette", () => {
  it("uses logo-led pills with explicit human-readable kinds", () => {
    render(<WorkspaceRailBody
      ventureId="v1"
      mode="product-gtm"
      workIndex={null}
      crew={crew}
      configuration={configuration}
      capabilities={[
        { id: "README.md", label: "README.md", provider: "native", kind: "markdown", authority: "read", status: "available", detail: "Product source", relevance: { atRest: true } },
        { id: "browser", label: "Browser", provider: "native", kind: "tool", authority: "read", status: "available", detail: "Inspect the web", relevance: { atRest: true } },
      ]}
      selectedThread={null}
      systemIndex={null}
      selectedObjectRef={null}
      readOnlyReason={null}
      search=""
      onUseAgent={vi.fn()}
      onSelectThread={vi.fn()}
      onSelectObject={vi.fn()}
      onConfigurationChanged={vi.fn()}
    />);

    expect(screen.getByRole("button", { name: "Researcher, Agent" })).toHaveClass("product-palette-pill");
    expect(screen.getByRole("button", { name: "README.md, Markdown, Read access" })).toHaveClass("product-palette-pill");
    expect(screen.getByRole("button", { name: "Browser, Tool, Read access" })).toHaveClass("product-palette-pill");
    expect(screen.getByTestId("agent-logo")).toBeInTheDocument();
  });

  it("keeps release navigation and fixed pipeline state out of the Product / GTM rail", () => {
    render(<WorkspaceRailBody
      ventureId="v1" mode="product-gtm" workIndex={null} crew={crew} configuration={configuration} capabilities={[]}
      selectedThread={null} selectedObjectRef={null} readOnlyReason={null} search=""
      systemIndex={{ ventureId: "v1", revision: 1, architectureRevision: 1, scope: "system", objects: [{ id: "motion", objectRef: "object:motion", name: "Founder-led sales", statement: "Learn directly with founders.", type: "motion", territory: "gtm", assertion: "founder-asserted", provenance: null, properties: {}, compatibilityOwned: false, architectureRole: null, threadRefs: [], attention: [], createdAt: null, updatedAt: null }], relationships: [], counts: { total: 1, product: 0, gtm: 1, attention: 0, matchCount: 1 } }}
      onUseAgent={vi.fn()} onSelectThread={vi.fn()} onSelectObject={vi.fn()} onConfigurationChanged={vi.fn()}
    />);

    expect(screen.queryByText("Releases")).not.toBeInTheDocument();
    expect(screen.queryByText("Prepare release")).not.toBeInTheDocument();
    expect(screen.queryByText("In market")).not.toBeInTheDocument();
    expect(screen.queryByText("Founder-led sales")).not.toBeInTheDocument();
  });

  it("shows only capabilities relevant to the selected object and states reconnect access honestly", () => {
    render(<WorkspaceRailBody
      ventureId="v1" mode="product-gtm" workIndex={null} crew={[]} configuration={configuration}
      capabilities={[
        { id: "repository", label: "Repository", provider: "native", kind: "workspace", authority: "inward", status: "available", detail: "Product workspace", relevance: { atRest: true } },
        { id: "gmail.read", label: "Gmail Read", provider: "gmail", kind: "source", authority: "read", status: "reconnect", detail: "Reconnect Gmail", relevance: { territories: ["gtm"], terms: ["email", "reply"] } },
        { id: "gmail.send", label: "Gmail Send", provider: "gmail", kind: "action", authority: "founder-gate", status: "reconnect", detail: "Reconnect Gmail", relevance: { territories: ["gtm"], terms: ["email", "send"] } },
        { id: "exa.search", label: "Exa Search", provider: "exa", kind: "source", authority: "read", status: "available", detail: "Search the web", relevance: { terms: ["research"] } },
      ]}
      selectedThread={null} selectedObjectRef="object:outreach" readOnlyReason={null} search=""
      systemIndex={{ ventureId: "v1", revision: 1, architectureRevision: 1, scope: "system", objects: [{ id: "outreach", objectRef: "object:outreach", name: "Founder email outreach", statement: "Send the message and watch for a reply.", type: "workflow", territory: "gtm", assertion: "founder-asserted", provenance: null, properties: {}, compatibilityOwned: false, architectureRole: null, threadRefs: [], attention: [], createdAt: null, updatedAt: null }], relationships: [], counts: { total: 1, product: 0, gtm: 1, attention: 0, matchCount: 1 } }}
      onUseAgent={vi.fn()} onSelectThread={vi.fn()} onSelectObject={vi.fn()} onConfigurationChanged={vi.fn()}
    />);

    const gmailRead = screen.getByRole("button", { name: "Gmail Read, Source, Read access, Reconnect" });
    expect(gmailRead).toHaveAttribute("aria-disabled", "true");
    expect(gmailRead).toHaveAttribute("draggable", "false");
    expect(screen.getByRole("button", { name: "Gmail Send, Action, Approval access, Reconnect" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Exa Search/ })).not.toBeInTheDocument();
  });
});
