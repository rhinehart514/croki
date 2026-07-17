// Thin wrapper over the existing atlas camera seam (useAtlasCamera). The immersive shell does NOT
// re-implement fly-in, camera-history, or altitude derivation — that engine already exists and is
// carefully measurement-gated. We wrap it so the immersive world consumes the same verbs
// (reveal / broaden / focus / frameTarget-via-reveal / altitude / fitWhole) the legacy triptych uses,
// against the same engine-placed node array. Phase 2 layers the tweened descend/rise on top; Phase 1
// only needs the fit + altitude + reveal seam so the world frames itself hub-centered on the stage.
//
// The reused hook keys its stage math off ".atlas-canvas" (the ReactFlow root) and clears chrome via
// ".atlas-return-band"/".atlas-controls" — all of which the immersive world reuses by rendering the
// real AtlasCanvas class name, so the framing math is identical.
import type { AtlasNode } from "@/components/atlas/atlasTypes";
import { useAtlasCamera } from "@/components/atlas/useAtlasCamera";

export function useImmersiveCamera(nodes: AtlasNode[], receiptKey: string) {
  return useAtlasCamera(nodes, receiptKey);
}
