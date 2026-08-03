import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

const root = NodePath.resolve(NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)), "..");
const readJson = (relativePath) =>
  JSON.parse(NodeFS.readFileSync(NodePath.join(root, relativePath), "utf8"));

const provenance = readJson("provenance/manifest.json");
const reviews = readJson("review/revisions.json");
const lottie = readJson("public/motion/lottielab/manifest.json");
const errors = [];

if (provenance.production.creativeStatus !== "accepted") {
  errors.push("Founder acceptance is required before a final render.");
}
if (reviews.revisions.some((review) => review.status !== "addressed")) {
  errors.push("Every founder review must be addressed before a final render.");
}
if (lottie.authoringStatus !== "export-verified") {
  errors.push("The LottieLab edit/export round trip must be verified before a final render.");
}

if (errors.length > 0) {
  process.stderr.write(`${errors.join("\n")}\n`);
  process.exit(1);
}

process.stdout.write("Final-render preflight passed.\n");
