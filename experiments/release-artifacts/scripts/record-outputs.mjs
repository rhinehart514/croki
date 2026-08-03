import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(root, "provenance", "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const specifications = [
  { file: "croki-launch-16x9.mp4", composition: "CrokiLaunch16x9" },
  { file: "croki-launch-9x16.mp4", composition: "CrokiLaunch9x16" },
];

manifest.production.outputs = specifications.map(({ file, composition }) => {
  const target = path.join(root, "output", file);
  const probe = JSON.parse(
    execFileSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration:stream=codec_type,codec_name,width,height,r_frame_rate,sample_rate,channels",
        "-of",
        "json",
        target,
      ],
      { encoding: "utf8" },
    ),
  );
  const video = probe.streams.find((stream) => stream.codec_type === "video");
  const audio = probe.streams.find((stream) => stream.codec_type === "audio");

  return {
    file,
    composition,
    sha256: createHash("sha256").update(readFileSync(target)).digest("hex"),
    durationSeconds: Number(probe.format.duration),
    width: video.width,
    height: video.height,
    fps: video.r_frame_rate,
    videoCodec: video.codec_name,
    audioCodec: audio.codec_name,
    audioSampleRate: Number(audio.sample_rate),
  };
});
manifest.production.renderedAt = new Date().toISOString();

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write("Recorded final output hashes and media metadata.\n");
