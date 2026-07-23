export const COMPOSER_JOURNEY_LIMIT_BYTES = 12 * 1024 * 1024;

const EXTENSIONS = new Set([".csv", ".json", ".jsonl"]);

export type PendingJourneyFile = {
  name: string;
  mediaType: string;
  size: number;
  data: string;
};

function extension(name: string) {
  const match = name.toLowerCase().match(/\.[^.]+$/);
  return match?.[0] ?? "";
}

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.onload = () => {
      const value = String(reader.result ?? "");
      resolve(value.slice(value.indexOf(",") + 1));
    };
    reader.readAsDataURL(file);
  });
}

export async function prepareJourneyFile(file: File): Promise<PendingJourneyFile> {
  const suffix = extension(file.name);
  if (!EXTENSIONS.has(suffix)) throw new Error(`${file.name} must be a CSV, JSON, or JSONL file.`);
  if (!file.size) throw new Error(`${file.name} is empty.`);
  if (file.size > COMPOSER_JOURNEY_LIMIT_BYTES) throw new Error(`${file.name} must be smaller than 12 MB.`);
  return {
    name: file.name,
    mediaType: file.type || (suffix === ".csv" ? "text/csv" : suffix === ".jsonl" ? "application/x-ndjson" : "application/json"),
    size: file.size,
    data: await readBase64(file),
  };
}
