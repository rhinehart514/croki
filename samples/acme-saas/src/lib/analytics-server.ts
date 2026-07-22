// Server-side Segment client. Used by server actions (signup, billing) to emit
// events from the backend, where the browser `analytics` instance isn't available.
import { Analytics } from "@segment/analytics-node";

const writeKey = process.env.SEGMENT_WRITE_KEY;

export const analytics: Pick<Analytics, "track"> = writeKey
  ? new Analytics({ writeKey })
  : {
      track() {
        // Analytics is optional in the bundled sample and local development.
      },
    };
