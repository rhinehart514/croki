import { Lottie, type LottieAnimationData } from "@remotion/lottie";
import signalField from "../../public/motion/lottielab/croki-signal-field.seed.json";

const animationData: LottieAnimationData = signalField;

export const LottieLabSignalField = ({ opacity = 1 }: { opacity?: number }) => (
  <Lottie
    animationData={animationData}
    loop
    renderer="svg"
    style={{ width: "100%", height: "100%", opacity }}
  />
);
