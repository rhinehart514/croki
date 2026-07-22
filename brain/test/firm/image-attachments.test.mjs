import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "drover-images-"));
process.env.GTM_IDE_PERSISTENCE = "json";
const { createVenture } = await import("../../src/firm/venture-store.mjs");
const { persistImageAttachments, publicImageAttachments, readImageAttachmentData } = await import("../../src/firm/image-attachments.mjs");
const options = { root };

describe("founder image attachments", () => {
  it("validates, content-addresses, and reads multiple venture-local images", () => {
    const venture = createVenture({ name: "visual context" }, options);
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 1]);
    const attachments = persistImageAttachments(venture.id, [
      { name: "screen.png", mediaType: "image/png", data: png.toString("base64") },
      { name: "reference.jpg", mediaType: "image/jpeg", data: jpeg.toString("base64") },
    ], options);
    assert.equal(attachments.length, 2);
    assert.ok(attachments.every((attachment) => fs.existsSync(attachment.path)));
    assert.deepEqual(publicImageAttachments(attachments).map((attachment) => attachment.name), ["screen.png", "reference.jpg"]);
    assert.equal(readImageAttachmentData(venture.id, attachments[0].id, options).data, png.toString("base64"));
  });

  it("rejects a mislabeled payload instead of persisting arbitrary bytes", () => {
    const venture = createVenture({ name: "invalid visual context" }, options);
    assert.throws(() => persistImageAttachments(venture.id, [{ name: "fake.png", mediaType: "image/png", data: Buffer.from("not an image").toString("base64") }], options), /does not match/);
  });
});
