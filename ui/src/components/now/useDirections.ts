import { useRef, useState } from "react";
import { suggestDirections, type DirectionOption } from "@/api";

// Deliberate intent-options assist for the composer. The founder summons candidate directions; while the
// grounded call runs (subscription-path latency is acceptable because it was asked for), the composer stays
// live and the options fill in non-blocking. A stale summon is dropped by sequence, so a slow earlier call
// never overwrites a newer one. Picking an option is the caller's job — this only fetches and holds them.
export function useDirections({ ventureId, mode, threadRef }: {
  ventureId: string;
  mode: string;
  threadRef: string | null;
}) {
  const [options, setOptions] = useState<DirectionOption[]>([]);
  const [loading, setLoading] = useState(false);
  const seqRef = useRef(0);
  const summon = (draft: string) => {
    const seq = seqRef.current + 1;
    seqRef.current = seq;
    setLoading(true);
    setOptions([]);
    void suggestDirections(ventureId, { draft, mode, threadRef })
      .then((result) => { if (seqRef.current === seq) setOptions(result.options ?? []); })
      .catch(() => { if (seqRef.current === seq) setOptions([]); })
      .finally(() => { if (seqRef.current === seq) setLoading(false); });
  };
  const clear = () => { seqRef.current += 1; setOptions([]); setLoading(false); };
  return { options, loading, summon, clear };
}
