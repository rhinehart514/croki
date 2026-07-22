import fs from "node:fs";
import path from "node:path";

const repository = path.resolve(import.meta.dirname, "..");
const failures = [];
const declarative = new Set(["ui/src/types.ts", "ui/src/components/now/directionModel.ts"]);

function files(directory, pattern) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? files(target, pattern) : pattern.test(entry.name) ? [target] : [];
  });
}

function lines(file) {
  return fs.readFileSync(file, "utf8").split(/\r?\n/).length;
}

for (const file of files(path.join(repository, "ui/src/components"), /\.tsx$/).filter((file) => !/\.(?:test|spec)\.tsx$/.test(file))) {
  const count = lines(file);
  if (count > 300) failures.push(`${path.relative(repository, file)}: ${count} lines exceeds the 300-line UI component limit`);
}
for (const file of files(path.join(repository, "brain/src"), /\.mjs$/)) {
  const count = lines(file);
  if (count > 500) failures.push(`${path.relative(repository, file)}: ${count} lines exceeds the 500-line service limit`);
}
for (const file of files(path.join(repository, "ui/src"), /\.ts$/).filter((file) => !/\.(?:test|spec)\.ts$/.test(file))) {
  const relative = path.relative(repository, file);
  if (declarative.has(relative)) continue;
  const count = lines(file);
  if (count > 500) failures.push(`${relative}: ${count} lines exceeds the 500-line UI service limit`);
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log("Production code-size limits verified (UI components ≤300; services ≤500 lines). ");
}
