import * as Cause from "effect/Cause";
import { describe, expect, it } from "vite-plus/test";

import { findEnvironmentQueryFailure } from "./query";

describe("environment query failures", () => {
  it("preserves typed failures without treating defects as expected failures", () => {
    const failure = { _tag: "ProjectReadFileError", failure: "operation_failed" } as const;

    expect(findEnvironmentQueryFailure(Cause.fail(failure))).toBe(failure);
    expect(findEnvironmentQueryFailure(Cause.die(new Error("defect")))).toBeNull();
  });
});
