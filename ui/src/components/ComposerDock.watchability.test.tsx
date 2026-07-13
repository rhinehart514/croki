import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ComposerDock } from "./ComposerDock";

beforeAll(() => {
  if (!("scrollTo" in Element.prototype)) {
    Object.defineProperty(Element.prototype, "scrollTo", { value: () => {}, writable: true });
  }
});

describe("ComposerDock — watchable hand-off", () => {
  it("clears an accepted message immediately and shows a truthful sent/current-step receipt", () => {
    const onSend = vi.fn(() => new Promise<void>(() => {}));
    render(
      <ComposerDock
        session={null}
        running={false}
        startOpen
        onSend={onSend}
        onCancel={() => {}}
        onReviewGate={() => {}}
      />,
    );

    const input = screen.getByRole("textbox", { name: "Message your crew" });
    fireEvent.change(input, { target: { value: "Find five grounded design partners" } });
    fireEvent.click(screen.getByRole("button", { name: "Send to your crew" }));

    expect(onSend).toHaveBeenCalledWith("Find five grounded design partners", undefined, expect.any(String));
    expect(input).toHaveValue("");
    expect(input).not.toBeDisabled();
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Sent");
    expect(status).toHaveTextContent("Grounding the request in your product");
    expect(status).toHaveTextContent("0:00");
  });
});
