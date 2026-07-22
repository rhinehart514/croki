export const COMPOSER_IMAGE_LIMITS = { count: 10, perImageBytes: 7 * 1024 * 1024, totalBytes: 20 * 1024 * 1024 } as const;
const SUPPORTED_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

export type PendingComposerImage = {
  id: string;
  name: string;
  mediaType: string;
  size: number;
  data: string;
  preview: string;
};

function readFile(file: File): Promise<PendingComposerImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.onload = () => {
      const preview = String(reader.result ?? "");
      const data = preview.slice(preview.indexOf(",") + 1);
      resolve({ id: `${file.name}:${file.size}:${file.lastModified}:${crypto.randomUUID?.() ?? Math.random()}`, name: file.name, mediaType: file.type, size: file.size, data, preview });
    };
    reader.readAsDataURL(file);
  });
}

export async function prepareComposerImages(files: Iterable<File>, current: PendingComposerImage[]) {
  const incoming = [...files];
  if (!incoming.length) return current;
  if (current.length + incoming.length > COMPOSER_IMAGE_LIMITS.count) throw new Error(`Attach up to ${COMPOSER_IMAGE_LIMITS.count} images at once.`);
  const unsupported = incoming.find((file) => !SUPPORTED_TYPES.has(file.type));
  if (unsupported) throw new Error(`${unsupported.name} must be a JPEG, PNG, GIF, or WebP image.`);
  const oversized = incoming.find((file) => file.size > COMPOSER_IMAGE_LIMITS.perImageBytes);
  if (oversized) throw new Error(`${oversized.name} must be smaller than 7 MB.`);
  if (current.reduce((sum, image) => sum + image.size, 0) + incoming.reduce((sum, file) => sum + file.size, 0) > COMPOSER_IMAGE_LIMITS.totalBytes) {
    throw new Error("Images can total up to 20 MB per message.");
  }
  return [...current, ...await Promise.all(incoming.map(readFile))];
}
