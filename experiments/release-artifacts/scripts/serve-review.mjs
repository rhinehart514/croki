import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = 4173;
const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".jpg", "image/jpeg"],
  [".png", "image/png"],
  [".mp4", "video/mp4"],
  [".webm", "video/webm"],
]);

createServer((request, response) => {
  const requestPath = decodeURIComponent(
    new URL(request.url ?? "/", `http://localhost:${port}`).pathname,
  );
  const relativePath =
    requestPath === "/"
      ? "review/index.html"
      : `${requestPath.replace(/^\/+/, "")}${requestPath.endsWith("/") ? "index.html" : ""}`;
  const candidate = path.resolve(root, relativePath);

  if (
    !candidate.startsWith(`${root}${path.sep}`) ||
    !existsSync(candidate) ||
    statSync(candidate).isDirectory()
  ) {
    response.writeHead(404).end("Not found");
    return;
  }

  const size = statSync(candidate).size;
  const commonHeaders = {
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-store",
    "Content-Type": contentTypes.get(path.extname(candidate)) ?? "application/octet-stream",
  };
  const range = request.headers.range?.match(/^bytes=(\d*)-(\d*)$/);

  if (request.headers.range && !range) {
    response.writeHead(416, { ...commonHeaders, "Content-Range": `bytes */${size}` }).end();
    return;
  }

  if (range) {
    const start = range[1] === "" ? 0 : Number(range[1]);
    const end = range[2] === "" ? size - 1 : Math.min(Number(range[2]), size - 1);
    if (
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      start < 0 ||
      start > end ||
      start >= size
    ) {
      response.writeHead(416, { ...commonHeaders, "Content-Range": `bytes */${size}` }).end();
      return;
    }
    response.writeHead(206, {
      ...commonHeaders,
      "Content-Length": end - start + 1,
      "Content-Range": `bytes ${start}-${end}/${size}`,
    });
    if (request.method === "HEAD") response.end();
    else createReadStream(candidate, { start, end }).pipe(response);
    return;
  }

  response.writeHead(200, { ...commonHeaders, "Content-Length": size });
  if (request.method === "HEAD") response.end();
  else createReadStream(candidate).pipe(response);
}).listen(port, "127.0.0.1", () => {
  process.stdout.write(`Croki release review: http://localhost:${port}/review/\n`);
});
