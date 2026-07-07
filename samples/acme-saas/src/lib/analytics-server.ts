// Server-side Segment client. Used by server actions (signup, billing) to emit
// events from the backend, where the browser `analytics` instance isn't available.
import { Analytics } from "@segment/analytics-node";

export const analytics = new Analytics({
  writeKey: process.env.SEGMENT_WRITE_KEY ?? "",
});
