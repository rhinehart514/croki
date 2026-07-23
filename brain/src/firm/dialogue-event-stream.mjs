import { getFirmConfiguration } from "./configuration.mjs";
import { subscribeFirmEvents } from "./firm-events.mjs";

// Data-free change notifications keep the desktop current without making the stream another source of
// truth. Every event tells the client to re-read the venture-scoped route that owns the actual state.
export function handleDialogueEventStream(ventureId, req, res) {
  getFirmConfiguration(ventureId);
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write(": connected\n\n");
  res.write("retry: 3000\n\n");
  const unsubscribe = subscribeFirmEvents(ventureId, (event) => {
    try {
      res.write(`event: ${event.kind}\n`);
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    } catch { /* close cleanup owns the disconnected response */ }
  });
  const heartbeat = setInterval(() => {
    try { res.write(": ping\n\n"); } catch { /* closed */ }
  }, 25_000);
  heartbeat.unref?.();
  const close = () => { clearInterval(heartbeat); unsubscribe(); };
  req.on("close", close);
  req.on("error", close);
}
