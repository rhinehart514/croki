import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProductPagePanel } from "./ProductPagePanel";
import type { ProductGtmPageData } from "./productGtmProjection";

const replyInConversation = vi.fn(async () => ({ act: "new-direction", threadRef: "thread:signup-work" }));
const modelChoice = { runtime: "codex", model: "gpt-5.6-sol", effort: "high" as const, interactionMode: "plan" as const };
vi.mock("@/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api")>()),
  replyInConversation: (...args: unknown[]) => replyInConversation(...args),
}));

function page(overrides: Partial<ProductGtmPageData> = {}): ProductGtmPageData {
  return {
    route: "/signup", file: "src/app/signup/page.tsx",
    sourceRef: "repository:src/app/signup/page.tsx#L1-L40:abc123def456",
    priorDirection: [], attachments: [], ...overrides,
  };
}

describe("product page panel", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the honest cited read of what the page is now", () => {
    render(<ProductPagePanel ventureId="venture-one" name="Signup" summary="Create your Acme workspace" pageRef="object:page-signup" page={page()} modelChoice={modelChoice} readOnly={false} onOpenWork={vi.fn()} />);
    expect(screen.getByText("What it is now")).toBeInTheDocument();
    expect(screen.getByText("Create your Acme workspace")).toBeInTheDocument();
    expect(screen.getByText(/src\/app\/signup\/page\.tsx:1–40/)).toBeInTheDocument();
  });

  it("mints an exact Work Thread scoped to the page from a brain-dump and follows it into Work", async () => {
    const onOpenWork = vi.fn();
    render(<ProductPagePanel ventureId="venture-one" name="Signup" summary="Create your Acme workspace" pageRef="object:page-signup" page={page()} modelChoice={modelChoice} readOnly={false} onOpenWork={onOpenWork} />);

    const start = screen.getByRole("button", { name: "Start work on this page" });
    expect(start).toBeDisabled();

    fireEvent.change(screen.getByLabelText("What should be different—and for whom?"), { target: { value: "Cut it to email and password only." } });
    expect(start).toBeEnabled();
    fireEvent.click(start);

    await waitFor(() => expect(replyInConversation).toHaveBeenCalledWith("venture-one", {
      message: "Cut it to email and password only.",
      subjectRefs: ["object:page-signup"],
      mode: "work",
      runtime: "codex",
      model: "gpt-5.6-sol",
      effort: "high",
      interactionMode: "plan",
      productGtmView: true,
    }));
    await waitFor(() => expect(onOpenWork).toHaveBeenCalledWith("thread:signup-work"));
    // The words are the Thread now, so the box that took them is empty and cannot start a duplicate.
    await waitFor(() => expect(screen.getByLabelText("What should be different—and for whom?")).toHaveValue(""));
    expect(screen.getByRole("button", { name: "Start work on this page" })).toBeDisabled();
  });

  it("surfaces the founder's prior direction and page-scoped strategy", () => {
    render(<ProductPagePanel ventureId="venture-one" name="Signup" summary="Create your Acme workspace" pageRef="object:page-signup" page={page({ priorDirection: ["Make the headline outcome-first"], attachments: [{ name: "Visitors bounce before the CTA", kind: "Assumption", statement: "Visitors bounce before the CTA" }] })} modelChoice={modelChoice} readOnly={false} onOpenWork={vi.fn()} />);
    expect(screen.getByText("Make the headline outcome-first")).toBeInTheDocument();
    expect(screen.getByText("Visitors bounce before the CTA")).toBeInTheDocument();
    expect(screen.getByText("Assumption")).toBeInTheDocument();
  });

  it("does not start work while read-only", () => {
    render(<ProductPagePanel ventureId="venture-one" name="Signup" summary="Create your Acme workspace" pageRef="object:page-signup" page={page()} modelChoice={modelChoice} readOnly onOpenWork={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Start work on this page" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Clarify intent" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Explore bigger value" })).toBeDisabled();
    expect(screen.getByLabelText("What should be different—and for whom?")).toBeDisabled();
  });

  it("clarifies the founder's exact words as a provisional intent view in the selected SDK", async () => {
    const onOpenWork = vi.fn();
    render(<ProductPagePanel ventureId="venture-one" name="Signup" summary="Create your Acme workspace" pageRef="object:page-signup" page={page()} modelChoice={modelChoice} readOnly={false} onOpenWork={onOpenWork} />);

    fireEvent.change(screen.getByLabelText("What should be different—and for whom?"), { target: { value: "Make setup feel safe for a first-time founder." } });
    fireEvent.click(screen.getByRole("button", { name: "Clarify intent" }));

    await waitFor(() => expect(replyInConversation).toHaveBeenCalledWith("venture-one", expect.objectContaining({
      message: expect.stringMatching(/Clarify this exact founder intent[\s\S]*Make setup feel safe for a first-time founder[\s\S]*governing question/),
      subjectRefs: ["object:page-signup"],
      mode: "work",
      runtime: "codex",
      model: "gpt-5.6-sol",
      effort: "high",
      interactionMode: "plan",
      productGtmView: true,
    })));
    expect(onOpenWork).toHaveBeenCalledWith("thread:signup-work");
  });

  it("can explore ambitious value from the latest page direction without retyping it", async () => {
    render(<ProductPagePanel ventureId="venture-one" name="Signup" summary="Create your Acme workspace" pageRef="object:page-signup" page={page({
      priorDirection: ["Help a solo founder reach first value before configuring a workspace."],
    })} modelChoice={modelChoice} readOnly={false} onOpenWork={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Explore bigger value" }));

    await waitFor(() => expect(replyInConversation).toHaveBeenCalledWith("venture-one", expect.objectContaining({
      message: expect.stringMatching(/materially more valuable[\s\S]*reach first value[\s\S]*eliminate the user's burden[\s\S]*own more of the outcome/),
      productGtmView: true,
    })));
  });

  it("only offers a market connection after a Product consequence is adopted", async () => {
    const { rerender } = render(<ProductPagePanel ventureId="venture-one" name="Signup" summary="Create your Acme workspace" pageRef="object:page-signup" page={page({
      attachments: [{ name: "Faster first value", kind: "Product consequence", statement: "People reach value before setup.", type: "product-consequence", assertion: "tentative" }],
    })} modelChoice={modelChoice} readOnly={false} onOpenWork={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "Connect this change to market" })).toBeNull();

    rerender(<ProductPagePanel ventureId="venture-one" name="Signup" summary="Create your Acme workspace" pageRef="object:page-signup" page={page({
      attachments: [{ name: "Faster first value", kind: "Product consequence", statement: "People reach value before setup.", type: "product-consequence", assertion: "founder-asserted" }],
    })} modelChoice={modelChoice} readOnly={false} onOpenWork={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Connect this change to market" }));

    await waitFor(() => expect(replyInConversation).toHaveBeenCalledWith("venture-one", expect.objectContaining({
      message: expect.stringContaining("Connect the adopted Product consequence"),
      subjectRefs: ["object:page-signup"],
    })));
  });
});
