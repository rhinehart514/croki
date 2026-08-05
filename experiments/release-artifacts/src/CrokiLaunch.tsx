import { AbsoluteFill, Audio, Sequence, staticFile } from "remotion";
import { CloseScene } from "./scenes/CloseScene";
import { ContextScene } from "./scenes/ContextScene";
import { ConvergenceScene } from "./scenes/ConvergenceScene";
import { ExecutionScene } from "./scenes/ExecutionScene";
import { TensionScene } from "./scenes/TensionScene";
import { scenes } from "./timing";

export type CrokiLaunchProps = {
  format: "landscape" | "portrait";
};

export const CrokiLaunch = ({ format }: CrokiLaunchProps) => {
  const portrait = format === "portrait";

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <Audio
        src={staticFile("experiments/release-artifacts/public/audio/croki-score.wav")}
        volume={1}
      />
      <Sequence from={scenes.tension.from} durationInFrames={scenes.tension.duration}>
        <TensionScene duration={scenes.tension.duration} portrait={portrait} />
      </Sequence>
      <Sequence from={scenes.convergence.from} durationInFrames={scenes.convergence.duration}>
        <ConvergenceScene duration={scenes.convergence.duration} portrait={portrait} />
      </Sequence>
      <Sequence from={scenes.context.from} durationInFrames={scenes.context.duration}>
        <ContextScene duration={scenes.context.duration} portrait={portrait} />
      </Sequence>
      <Sequence from={scenes.execution.from} durationInFrames={scenes.execution.duration}>
        <ExecutionScene duration={scenes.execution.duration} portrait={portrait} />
      </Sequence>
      <Sequence from={scenes.close.from} durationInFrames={scenes.close.duration}>
        <CloseScene duration={scenes.close.duration} portrait={portrait} />
      </Sequence>
    </AbsoluteFill>
  );
};
