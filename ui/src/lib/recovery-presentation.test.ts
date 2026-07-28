import { describe, expect, it } from "vitest";
import { recoveryPresentation, type RecoveryLayer } from "./recovery-presentation";
import { workStatusLabel } from "@/components/work-mode/workStatusLabel";

const layers: RecoveryLayer[] = [
  "engine",
  "provider",
  "auth",
  "transport",
  "thread-sync",
  "repository",
  "checkpoint",
  "verification",
  "terminal",
  "preview",
  "git",
  "outward-action",
];

describe("factual layered recovery", () => {
  it.each(layers)("names the %s layer, retained state, and one exact action", (layer) => {
    const presentation = recoveryPresentation(layer);
    expect(presentation.layer).toBe(layer);
    expect(presentation.title).toMatch(/\S/);
    expect(presentation.retained).toMatch(/retained|remain|unchanged/i);
    expect(presentation.action).toMatch(/retry|resume|restart|verify/i);
  });

  it("never projects raw transport payloads, secrets, or hidden reasoning", () => {
    const raw = "/api/ventures/private failed (502) token=sk-secret chain_of_thought=private";
    for (const layer of layers) {
      const visible = JSON.stringify(recoveryPresentation(layer));
      expect(visible).not.toContain(raw);
      expect(visible).not.toMatch(/\/api\/|sk-secret|chain.of.thought|502/i);
    }
  });

  it("keeps interruption, founder wait, budget exhaustion, and failure distinct", () => {
    expect(workStatusLabel("interrupted")).toBe("interrupted — ready to resume");
    expect(workStatusLabel("paused")).toBe("waiting for founder decision");
    expect(workStatusLabel("budget-exhausted")).toBe("budget reached — waiting for founder");
    expect(workStatusLabel("failed")).toBe("failed — recovery available");
  });
});
