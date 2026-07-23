import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ComposerJourneyInput } from "./ComposerJourneyInput";

describe("ComposerJourneyInput", () => {
  it("keeps the resting composer compact and accepts one journey file", () => {
    const choose = vi.fn();
    const { container } = render(<ComposerJourneyInput attachment={null} disabled={false} staging={false} onChoose={choose} onRemove={() => {}} />);
    const file = new File(["[]"], "journey.json", { type: "application/json" });
    fireEvent.change(container.querySelector("input")!, { target: { files: [file] } });
    expect(choose).toHaveBeenCalledWith(file);
    expect(screen.getByRole("button", { name: "Add observed journey data" })).toBeVisible();
  });

  it("shows the staged source as exact Thread context", () => {
    const remove = vi.fn();
    render(<ComposerJourneyInput
      attachment={{ importRef: "journey:one", name: "observed.csv", byteSize: 420, rowCount: 12 }}
      disabled={false}
      staging={false}
      onChoose={() => {}}
      onRemove={remove}
    />);
    expect(screen.getByLabelText("Observed journey source observed.csv")).toHaveTextContent("12 rows");
    fireEvent.click(screen.getByRole("button", { name: "Remove observed.csv" }));
    expect(remove).toHaveBeenCalledOnce();
  });
});
