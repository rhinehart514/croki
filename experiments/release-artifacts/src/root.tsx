import { Composition } from "remotion";
import { CrokiLaunch } from "./CrokiLaunch";
import { LottieLabSignalField } from "./components/LottieLabMotion";
import { DURATION_IN_FRAMES, FPS } from "./timing";

export const ReleaseArtifactRoot = () => (
  <>
    <Composition
      id="CrokiLaunch16x9"
      component={CrokiLaunch}
      durationInFrames={DURATION_IN_FRAMES}
      fps={FPS}
      width={1920}
      height={1080}
      defaultProps={{ format: "landscape" as const }}
    />
    <Composition
      id="CrokiLaunch9x16"
      component={CrokiLaunch}
      durationInFrames={DURATION_IN_FRAMES}
      fps={FPS}
      width={1080}
      height={1920}
      defaultProps={{ format: "portrait" as const }}
    />
    <Composition
      id="CrokiMotionAsset"
      component={LottieLabSignalField}
      durationInFrames={90}
      fps={30}
      width={800}
      height={800}
      defaultProps={{ opacity: 1 }}
    />
  </>
);
