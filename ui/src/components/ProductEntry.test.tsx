import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ProductEntry } from "./ProductEntry";

// The "Try it on a sample product" path is the stranger's on-ramp: no repo of their own, one click,
// and the scan runs on the bundled sample. These assert the wiring that must hold — the click pulls the
// sample's real path + win event from the server and runs the SAME scanPreview a real folder would,
// scanning for the sample's own win event (signup_completed), never a hardcoded default.
vi.mock("@/api", () => ({
  getSampleProduct: vi.fn(),
  scanPreview: vi.fn(),
  pickFolder: vi.fn(),
}));

import { getSampleProduct, scanPreview, pickFolder } from "@/api";

const sample = {
  repoPath: "/abs/path/samples/acme-saas",
  winEvent: "signup_completed",
  name: "Acme",
  blurb: "A small team task tracker.",
};

const scanResult = {
  headline: "Tracking gap proven: attribution is captured but missing from signup_completed.",
  stack: ["package.json", "next.config.mjs"],
  winEvent: { name: "signup_completed", found: true, citations: [] },
  winEventEvidence: [],
  blindAttribution: { blind: false, reason: "signup_completed carries no attribution properties." },
  productLine: "Next.js project, 9 files scanned.",
} as unknown as Awaited<ReturnType<typeof scanPreview>>;

describe("ProductEntry — try the sample product", () => {
  beforeEach(() => {
    vi.mocked(getSampleProduct).mockReset();
    vi.mocked(scanPreview).mockReset();
    vi.mocked(pickFolder).mockReset();
  });

  it("scans the bundled sample with its own path and win event on click", async () => {
    vi.mocked(getSampleProduct).mockResolvedValue(sample);
    vi.mocked(scanPreview).mockResolvedValue(scanResult);

    render(<ProductEntry busy={false} onStart={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /try it on a sample product/i }));

    await waitFor(() => expect(getSampleProduct).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(scanPreview).toHaveBeenCalledWith(sample.repoPath, sample.winEvent),
    );
    // The folder picker is never touched on the sample path.
    expect(pickFolder).not.toHaveBeenCalled();
    // The scan's headline surfaces in the preview.
    await waitFor(() => expect(screen.getByText(/Tracking gap proven/i)).toBeTruthy());
  });

  it("surfaces an error instead of the preview when the sample can't be loaded", async () => {
    vi.mocked(getSampleProduct).mockRejectedValue(new Error("Bundled sample product not found."));

    render(<ProductEntry busy={false} onStart={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /try it on a sample product/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(scanPreview).not.toHaveBeenCalled();
  });
});
