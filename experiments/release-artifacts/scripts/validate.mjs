import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = path.resolve(root, "../..");
const manifest = JSON.parse(readFileSync(path.join(root, "provenance", "manifest.json"), "utf8"));
const captureManifest = JSON.parse(
  readFileSync(path.join(root, "public", "captures", "manifest.json"), "utf8"),
);
const reviewManifest = JSON.parse(
  readFileSync(path.join(root, "review", "revisions.json"), "utf8"),
);
const lottieManifest = JSON.parse(
  readFileSync(path.join(root, "public", "motion", "lottielab", "manifest.json"), "utf8"),
);
const projectConfig = JSON.parse(readFileSync(path.join(repositoryRoot, "croki.json"), "utf8"));
const fontPackagePath = path.join(root, "node_modules", "@fontsource", "inter", "package.json");
const fontPackage = existsSync(fontPackagePath)
  ? JSON.parse(readFileSync(fontPackagePath, "utf8"))
  : undefined;
const expected = [
  ["croki-launch-16x9.mp4", 1920, 1080],
  ["croki-launch-9x16.mp4", 1080, 1920],
];

const errors = [];
if (fontPackage.version !== "5.2.8" || fontPackage.license !== "OFL-1.1") {
  errors.push("The deterministic Inter font dependency is missing or has changed.");
}
const hashFile = (target) => createHash("sha256").update(readFileSync(target)).digest("hex");
const probeMedia = (target) =>
  JSON.parse(
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
const measureLoudness = (target) => {
  const result = spawnSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-i",
      target,
      "-af",
      `loudnorm=I=${manifest.production.audioTargetLufs}:TP=${manifest.production.maxTruePeakDbtp}:LRA=6:print_format=json`,
      "-f",
      "null",
      "-",
    ],
    { encoding: "utf8" },
  );
  const integrated = result.stderr.match(/"input_i"\s*:\s*"([^"]+)"/);
  const truePeak = result.stderr.match(/"input_tp"\s*:\s*"([^"]+)"/);
  return {
    integrated: integrated ? Number(integrated[1]) : Number.NaN,
    truePeak: truePeak ? Number(truePeak[1]) : Number.NaN,
  };
};

for (const [file, width, height] of expected) {
  const target = path.join(root, "output", file);
  if (!existsSync(target)) {
    errors.push(`Missing ${file}`);
    continue;
  }
  const probe = probeMedia(target);
  const video = probe.streams.find((stream) => stream.codec_type === "video");
  const audio = probe.streams.find((stream) => stream.codec_type === "audio");
  const duration = Number(probe.format.duration);
  if (video?.width !== width || video?.height !== height)
    errors.push(`${file} has incorrect dimensions`);
  if (video?.codec_name !== "h264") errors.push(`${file} must use H.264 video`);
  if (video?.r_frame_rate !== "30/1") errors.push(`${file} must render at 30 fps`);
  if (audio?.codec_name !== "aac" || Number(audio?.sample_rate) !== 48000) {
    errors.push(`${file} must contain 48 kHz AAC audio`);
  }
  if (Math.abs(duration - manifest.production.durationSeconds) > 0.15)
    errors.push(`${file} has duration ${duration}`);
  const loudness = measureLoudness(target);
  if (
    !Number.isFinite(loudness.integrated) ||
    Math.abs(loudness.integrated - manifest.production.audioTargetLufs) > 1
  ) {
    errors.push(`${file} has integrated loudness ${loudness.integrated} LUFS`);
  }
  if (
    !Number.isFinite(loudness.truePeak) ||
    loudness.truePeak > manifest.production.maxTruePeakDbtp
  ) {
    errors.push(`${file} has true peak ${loudness.truePeak} dBTP`);
  }

  const outputRecord = manifest.production.outputs?.find((output) => output.file === file);
  if (!outputRecord) {
    errors.push(`Missing final output provenance for ${file}`);
  } else {
    if (hashFile(target) !== outputRecord.sha256)
      errors.push(`Final output hash mismatch for ${file}`);
    if (outputRecord.width !== width || outputRecord.height !== height) {
      errors.push(`Final output provenance has incorrect dimensions for ${file}`);
    }
  }
}

if (manifest.captures.length === 0)
  errors.push("No deterministic product captures recorded in provenance.");
for (const capture of captureManifest.captures) {
  const target = path.join(root, "public", "captures", capture.path);
  if (!existsSync(target)) {
    errors.push(`Missing capture ${capture.path}`);
    continue;
  }
  if (hashFile(target) !== capture.sha256) errors.push(`Capture hash mismatch for ${capture.path}`);
  if (capture.status !== "reviewed") errors.push(`Capture ${capture.id} has not been reviewed`);
  if (capture.sourceCommit !== manifest.sourceCommit)
    errors.push(`Capture ${capture.id} has a different source commit`);

  const probe = probeMedia(target);
  const video = probe.streams.find((stream) => stream.codec_type === "video");
  if (capture.durationSeconds !== undefined) {
    const duration = Number(probe.format.duration);
    if (Math.abs(duration - capture.durationSeconds) > 0.15) {
      errors.push(`Capture ${capture.id} has duration ${duration}`);
    }
  }
  if (
    capture.width !== undefined &&
    (video?.width !== capture.width || video?.height !== capture.height)
  ) {
    errors.push(`Capture ${capture.id} has incorrect dimensions`);
  }
}
const captureRecords = new Map(captureManifest.captures.map((capture) => [capture.id, capture]));
if (
  captureManifest.captures.length !== manifest.captures.length ||
  manifest.captures.some(
    (capture) =>
      captureRecords.get(capture.id)?.path !== capture.path.replace("public/captures/", ""),
  )
) {
  errors.push("Capture and provenance manifests disagree.");
}

for (const claim of manifest.claims) {
  const match = claim.evidence.match(/^(.+?)(?::(\d+))?$/);
  const evidencePath = match ? path.join(repositoryRoot, match[1]) : "";
  if (!match || !existsSync(evidencePath)) {
    errors.push(`Missing evidence for claim: ${claim.text}`);
    continue;
  }
  if (match[2]) {
    const line = readFileSync(evidencePath, "utf8").split(/\r?\n/)[Number(match[2]) - 1];
    if (!line?.trim()) errors.push(`Claim evidence line is empty or missing: ${claim.evidence}`);
  }
}
if (manifest.reviews.length < 2 || reviewManifest.revisions.length < 2) {
  errors.push("Fewer than two founder revision cycles recorded.");
}
if (reviewManifest.revisions.some((review) => review.status !== "addressed")) {
  errors.push("Not every founder revision has been addressed.");
}
if (manifest.production.voice !== "none") errors.push("Generated voice is not allowed.");
if (manifest.production.creativeStatus !== "accepted") {
  errors.push("Founder has not accepted the current creative cut.");
}
if (lottieManifest.authoringStatus !== "export-verified") {
  errors.push("LottieLab authoring and export round trip is incomplete.");
} else {
  const lottieExport = path.join(
    root,
    "public",
    "motion",
    "lottielab",
    lottieManifest.expectedExport,
  );
  if (!existsSync(lottieExport)) {
    errors.push(`Missing verified LottieLab export ${lottieManifest.expectedExport}`);
  } else if (!lottieManifest.export?.sha256) {
    errors.push("LottieLab export hash is missing from its manifest.");
  } else {
    if (hashFile(lottieExport) !== lottieManifest.export.sha256)
      errors.push("LottieLab export hash mismatch.");
    const componentSource = readFileSync(
      path.join(root, "src", "components", "LottieLabMotion.tsx"),
      "utf8",
    );
    if (!componentSource.includes(lottieManifest.expectedExport)) {
      errors.push("The Remotion composition is not using the verified LottieLab export.");
    }
  }
}

const requiredActions = [
  "Setup Release Artifacts",
  "Launch Studio",
  "Render Launch Draft",
  "Review Launch Draft",
  "Render Launch Final",
  "Validate Release Artifacts",
];
const actionNames = new Set(projectConfig.scripts.map((script) => script.name));
for (const action of requiredActions) {
  if (!actionNames.has(action)) errors.push(`Missing Croki project action: ${action}`);
}

for (const required of [
  path.join(root, "README.md"),
  path.join(root, "LICENSING.md"),
  path.join(root, "provenance", "brief.md"),
  path.join(root, "provenance", "completion-audit.md"),
  path.join(repositoryRoot, ".agents", "skills", "release-artifacts", "SKILL.md"),
]) {
  if (!existsSync(required)) errors.push(`Missing workflow documentation: ${required}`);
}

if (errors.length > 0) {
  process.stderr.write(`${errors.join("\n")}\n`);
  process.exit(1);
}
process.stdout.write("Release artifact workflow validated.\n");
