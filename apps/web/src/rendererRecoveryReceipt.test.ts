import { describe, expect, it } from "vite-plus/test";

import {
  clearRendererRecoveryReceipt,
  readRendererRecoveryReceipt,
  rendererRecoveryDescription,
} from "./rendererRecoveryReceipt";

describe("renderer recovery receipt", () => {
  it("reads a restored OOM recovery without consuming unrelated route state", () => {
    const url = new URL(
      "croki-dev://app/local/thread-1?panel=preview&croki-recovery=renderer&croki-recovery-reason=oom&croki-recovery-location=restored#activity",
    );

    const receipt = readRendererRecoveryReceipt(url);
    expect(receipt).toEqual({ reason: "oom", location: "restored" });
    expect(rendererRecoveryDescription(receipt!)).toContain("reopened this screen");

    const cleanUrl = clearRendererRecoveryReceipt(url);
    expect(cleanUrl.toString()).toBe("croki-dev://app/local/thread-1?panel=preview#activity");
  });

  it("describes reset location honestly", () => {
    const receipt = readRendererRecoveryReceipt(
      new URL(
        "croki-dev://app/?croki-recovery=renderer&croki-recovery-reason=crashed&croki-recovery-location=reset",
      ),
    );

    expect(receipt).toEqual({ reason: "crashed", location: "reset" });
    expect(rendererRecoveryDescription(receipt!)).toContain(
      "previous screen and unsaved browser-only state could not be restored",
    );
  });

  it("rejects incomplete or foreign recovery markers", () => {
    expect(
      readRendererRecoveryReceipt(
        new URL("croki-dev://app/?croki-recovery=renderer&croki-recovery-reason=oom"),
      ),
    ).toBeNull();
    expect(
      readRendererRecoveryReceipt(
        new URL(
          "croki-dev://app/?croki-recovery=server&croki-recovery-reason=oom&croki-recovery-location=restored",
        ),
      ),
    ).toBeNull();
  });
});
