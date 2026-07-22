import fs from "node:fs";
import { json } from "../routes/util.mjs";
import { readImageAttachmentData, resolveImageAttachment } from "./image-attachments.mjs";

export default function handleImageAttachmentRoute({ req, res, url, options = {} }) {
  const dataMatch = url.pathname.match(/^\/api\/ventures\/([^/]+)\/attachments\/(image-[a-f0-9]{32})\/data$/);
  if (req.method === "GET" && dataMatch) {
    const image = readImageAttachmentData(decodeURIComponent(dataMatch[1]), dataMatch[2], options);
    if (!image) json(res, 404, { error: "No such image attachment." });
    else json(res, 200, { dataUrl: `data:${image.mediaType};base64,${image.data}` });
    return true;
  }
  const rawMatch = url.pathname.match(/^\/api\/ventures\/([^/]+)\/attachments\/(image-[a-f0-9]{32})$/);
  if (req.method !== "GET" || !rawMatch) return false;
  const image = resolveImageAttachment(decodeURIComponent(rawMatch[1]), rawMatch[2], options);
  if (!image) json(res, 404, { error: "No such image attachment." });
  else {
    res.writeHead(200, { "Content-Type": image.mediaType, "Cache-Control": "private, max-age=31536000, immutable" });
    fs.createReadStream(image.path).pipe(res);
  }
  return true;
}
