import { assert, describe, it } from "@effect/vitest";

import {
  isNightlyDesktopVersion,
  resolveDefaultDesktopUpdateChannel,
  resolveDesktopGitHubUpdateFeed,
} from "./updateChannels.ts";

describe("desktop update channels", () => {
  it("recognizes and defaults nightly desktop versions", () => {
    assert.isTrue(isNightlyDesktopVersion("0.4.14-nightly.20260815.1786811041"));
    assert.equal(
      resolveDefaultDesktopUpdateChannel("0.4.14-nightly.20260815.1786811041"),
      "nightly",
    );
    assert.equal(resolveDefaultDesktopUpdateChannel("0.4.14"), "latest");
  });

  it("moves official Croki builds between the stable and public nightly repositories", () => {
    assert.deepEqual(
      resolveDesktopGitHubUpdateFeed(
        { provider: "github", owner: "rhinehart514", repo: "croki" },
        "nightly",
      ),
      {
        provider: "github",
        owner: "rhinehart514",
        repo: "croki-releases",
        releaseType: "prerelease",
        channel: "nightly",
      },
    );
    assert.deepEqual(
      resolveDesktopGitHubUpdateFeed(
        { provider: "github", owner: "rhinehart514", repo: "croki-releases" },
        "latest",
      ),
      {
        provider: "github",
        owner: "rhinehart514",
        repo: "croki",
        releaseType: "release",
      },
    );
  });

  it("keeps custom GitHub feeds in their configured repository", () => {
    assert.deepEqual(
      resolveDesktopGitHubUpdateFeed(
        { provider: "github", owner: "acme", repo: "croki-builds" },
        "nightly",
      ),
      {
        provider: "github",
        owner: "acme",
        repo: "croki-builds",
        releaseType: "prerelease",
        channel: "nightly",
      },
    );
    assert.isNull(
      resolveDesktopGitHubUpdateFeed(
        { provider: "generic", url: "https://updates.example.com" },
        "nightly",
      ),
    );
  });
});
