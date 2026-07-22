// Founder-supplied image context. Images are immutable, content-addressed files inside the venture's
// own local directory; conversation records keep only portable metadata while provider adapters receive
// the resolved local path for the duration of the authorized drive.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { storeRoot } from "../persistence.mjs";
import { openVenture, safeId } from "./venture-store.mjs";

export const IMAGE_ATTACHMENT_LIMITS = Object.freeze({ count: 10, perImageBytes: 7 * 1024 * 1024, totalBytes: 20 * 1024 * 1024 });

const FORMATS = Object.freeze({
  "image/jpeg": { extension: ".jpg", matches: (buffer) => buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff },
  "image/png": { extension: ".png", matches: (buffer) => buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  "image/gif": { extension: ".gif", matches: (buffer) => buffer.length >= 6 && ["GIF87a", "GIF89a"].includes(buffer.subarray(0, 6).toString("ascii")) },
  "image/webp": { extension: ".webp", matches: (buffer) => buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP" },
});

function attachmentRoot(ventureId, options = {}) {
  return path.join(storeRoot(options), "ventures", safeId(ventureId), "attachments");
}

function cleanName(value, fallback) {
  const name = path.basename(String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "")).trim();
  return (name || fallback).slice(0, 180);
}

function decodeImage(input, index) {
  const declaredType = String(input?.mediaType ?? input?.type ?? "").toLowerCase();
  if (!FORMATS[declaredType]) throw Object.assign(new Error(`Image ${index + 1} must be a JPEG, PNG, GIF, or WebP file.`), { status: 400 });
  const encoded = String(input?.data ?? "").replace(/\s/g, "");
  if (!encoded || !/^[a-z0-9+/]+={0,2}$/i.test(encoded)) throw Object.assign(new Error(`Image ${index + 1} is not valid image data.`), { status: 400 });
  const buffer = Buffer.from(encoded, "base64");
  if (!buffer.length || !FORMATS[declaredType].matches(buffer)) throw Object.assign(new Error(`Image ${index + 1} does not match its ${declaredType} file type.`), { status: 400 });
  if (buffer.length > IMAGE_ATTACHMENT_LIMITS.perImageBytes) throw Object.assign(new Error(`Each image must be smaller than 7 MB.`), { status: 413 });
  return { buffer, mediaType: declaredType };
}

export function persistImageAttachments(ventureId, inputs, options = {}) {
  if (inputs == null) return [];
  if (!Array.isArray(inputs)) throw Object.assign(new Error("Image attachments must be a list."), { status: 400 });
  if (inputs.length > IMAGE_ATTACHMENT_LIMITS.count) throw Object.assign(new Error(`Attach up to ${IMAGE_ATTACHMENT_LIMITS.count} images at once.`), { status: 413 });
  if (!inputs.length) return [];
  if (!openVenture(ventureId, options)) throw Object.assign(new Error(`No such venture: ${ventureId}`), { code: "venture_not_found", status: 404 });

  const decoded = inputs.map(decodeImage);
  const total = decoded.reduce((sum, image) => sum + image.buffer.length, 0);
  if (total > IMAGE_ATTACHMENT_LIMITS.totalBytes) throw Object.assign(new Error("Images can total up to 20 MB per message."), { status: 413 });
  const root = attachmentRoot(ventureId, options);
  fs.mkdirSync(root, { recursive: true });

  return decoded.map(({ buffer, mediaType }, index) => {
    const digest = crypto.createHash("sha256").update(buffer).digest("hex");
    const id = `image-${digest.slice(0, 32)}`;
    const filePath = path.join(root, `${id}${FORMATS[mediaType].extension}`);
    try { fs.writeFileSync(filePath, buffer, { flag: "wx", mode: 0o600 }); }
    catch (error) { if (error?.code !== "EEXIST") throw error; }
    return {
      id,
      name: cleanName(inputs[index]?.name, `${id}${FORMATS[mediaType].extension}`),
      mediaType,
      size: buffer.length,
      path: filePath,
    };
  });
}

export function publicImageAttachments(attachments) {
  return (attachments ?? []).map(({ id, name, mediaType, size }) => ({ id, name, mediaType, size }));
}

export function resolveImageAttachment(ventureId, imageId, options = {}) {
  const id = String(imageId ?? "");
  if (!/^image-[a-f0-9]{32}$/.test(id) || !openVenture(ventureId, options)) return null;
  const root = attachmentRoot(ventureId, options);
  for (const [mediaType, format] of Object.entries(FORMATS)) {
    const filePath = path.join(root, `${id}${format.extension}`);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) return { path: filePath, mediaType };
  }
  return null;
}

export function readImageAttachmentData(ventureId, imageId, options = {}) {
  const image = resolveImageAttachment(ventureId, imageId, options);
  return image ? { mediaType: image.mediaType, data: fs.readFileSync(image.path).toString("base64") } : null;
}
