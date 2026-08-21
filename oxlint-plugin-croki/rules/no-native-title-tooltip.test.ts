import { assert, describe } from "@effect/vitest";

import { createOxlintRuleHarness } from "../test/utils.ts";

const rule = createOxlintRuleHarness("croki/no-native-title-tooltip", {
  filename: "fixture.tsx",
});

describe("croki/no-native-title-tooltip", () => {
  rule.valid("allows intrinsic elements without title", `<span>Text</span>`);
  rule.valid("allows title props on custom components", `<SettingsRow title="Word wrap" />`);
  rule.valid("allows title on embedded content", `<iframe title="Widget" />`);
  rule.valid("allows the svg title child", `<svg><title>QR code</title></svg>`);

  rule.invalid("reports title on a span", `<span title="Full name">Name</span>`, (output) => {
    assert.match(output, /native title attribute/);
  });
  rule.invalid("reports title on a button", `<button title="Scroll to end" />`, (output) =>
    assert.match(output, /Tooltip \+ TooltipTrigger \+ TooltipPopup/),
  );
  rule.invalid("reports title on an anchor", `<a href="#" title="More">More</a>`);
});
