import { Readable } from "node:stream";

const [root, ventureId] = process.argv.slice(2);
process.env.GTM_IDE_HOME = root;

const [
  { default: dialogueRoutes },
  { founderHeaders },
  { acceptDesktopWorkCommand },
  { executeDesktopWorkRequest },
] = await Promise.all([
  import("../src/firm/dialogue-routes.mjs"),
  import("../test/helpers/founder-capability.mjs"),
  import("../src/firm/work-protocol-desktop.mjs"),
  import("../src/firm/work-command-routes.mjs"),
]);

const pathname = `/api/ventures/${ventureId}/conversation/reply`;
const body = JSON.stringify({ message: "Keep this exact accepted turn recoverable" });
const input = {
  method: "POST",
  path: pathname,
  body,
  headers: {
    ...founderHeaders({ method: "POST", path: pathname }),
    "content-type": "application/json",
    "x-drover-idempotency-key": "route-boundary-once",
    "x-drover-venture-id": ventureId,
    "x-drover-expected-projection-revision": "0",
  },
};
const runtime = {
  id: "crash-fixture-provider",
  label: "Crash fixture provider",
  costReporting: "tokens",
  async drive(ctx) {
    ctx.onRuntimeSession("native-session-before-crash");
    ctx.onTextDelta("A coherent partial reply survived the crash.");
    await new Promise(() => {});
  },
};

async function dispatch(request) {
  const req = Readable.from([request.body]);
  req.method = request.method;
  req.url = request.path;
  req.headers = request.headers;
  req.socket = { remoteAddress: "127.0.0.1" };
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      chunks: [],
      setHeader() {},
      writeHead(status) { this.statusCode = status; },
      end(chunk = "") {
        if (chunk) this.chunks.push(String(chunk));
        resolve({ status: this.statusCode, headers: {}, body: this.chunks.join("") });
      },
    };
    dialogueRoutes({
      req,
      res,
      url: new URL(request.path, "http://local"),
      deps: { appendOptions: { root }, workLoopDeps: { runtime } },
    }).catch(reject);
  });
}

const execute = (request) => executeDesktopWorkRequest(request, {
  acceptCommand: acceptDesktopWorkCommand,
  dispatch,
});
const first = await execute(input);
const second = await execute(input);
process.send?.({
  stage: "route-accepted",
  status: first.status,
  body: JSON.parse(first.body || "{}"),
  retry: { status: second.status, body: JSON.parse(second.body || "{}") },
});
await new Promise(() => {});
