import fs from "node:fs";

export function imageContentBlocks(attachments = []) {
  return attachments.map((attachment) => ({
    type: "image",
    source: {
      type: "base64",
      media_type: attachment.mediaType,
      data: fs.readFileSync(attachment.path).toString("base64"),
    },
  }));
}

export function imageUserContent(text, attachments = []) {
  if (!attachments.length) return text;
  return [...imageContentBlocks(attachments), { type: "text", text }];
}

export function sdkImagePrompt(text, attachments = []) {
  if (!attachments.length) return text;
  const content = imageUserContent(text, attachments);
  return (async function* prompt() {
    yield { type: "user", message: { role: "user", content }, parent_tool_use_id: null };
  }());
}
