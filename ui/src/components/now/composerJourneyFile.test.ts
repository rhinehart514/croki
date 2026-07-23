import { describe, expect, it } from "vitest";
import { COMPOSER_JOURNEY_LIMIT_BYTES, prepareJourneyFile } from "./composerJourneyFile";

describe("composer journey files", () => {
  it("prepares one provider-neutral journey file", async () => {
    const file = new File(["session,route\none,/pricing\n"], "journey.csv", { type: "text/csv" });
    const prepared = await prepareJourneyFile(file);
    expect(prepared).toMatchObject({ name: "journey.csv", mediaType: "text/csv", size: file.size });
    expect(atob(prepared.data)).toContain("/pricing");
  });

  it("rejects unsupported, empty, and oversized files before upload", async () => {
    await expect(prepareJourneyFile(new File(["x"], "journey.txt", { type: "text/plain" }))).rejects.toThrow(/CSV, JSON, or JSONL/);
    await expect(prepareJourneyFile(new File([], "journey.json", { type: "application/json" }))).rejects.toThrow(/empty/);
    const oversized = { name: "journey.csv", type: "text/csv", size: COMPOSER_JOURNEY_LIMIT_BYTES + 1 } as File;
    await expect(prepareJourneyFile(oversized)).rejects.toThrow(/smaller than 12 MB/);
  });
});
