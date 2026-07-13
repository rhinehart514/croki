import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { ambientDriverPolicy } from "../src/ambient-scheduler.mjs";

describe("ambient driver policy", () => {
  const prior = process.env.GTM_IDE_ENABLE_AMBIENT_CREATION;

  afterEach(() => {
    if (prior === undefined) delete process.env.GTM_IDE_ENABLE_AMBIENT_CREATION;
    else process.env.GTM_IDE_ENABLE_AMBIENT_CREATION = prior;
  });

  it("automates only outcome reading by default", () => {
    delete process.env.GTM_IDE_ENABLE_AMBIENT_CREATION;
    assert.deepEqual(ambientDriverPolicy(), {
      outcomeReads: true,
      standingBriefs: false,
      repeatableMotions: false,
      inputRouting: false,
    });
  });

  it("keeps the old creative drivers behind an explicit compatibility opt-in", () => {
    assert.deepEqual(ambientDriverPolicy({ enableCreativeDrivers: true }), {
      outcomeReads: true,
      standingBriefs: true,
      repeatableMotions: true,
      inputRouting: true,
    });
  });
});
