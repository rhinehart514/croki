import type { CrokiCanvasProps } from "./crokiCanvasProps";

export function artifactAtRevision(props: CrokiCanvasProps, scrubRevision: number | null) {
  if (scrubRevision === null) {
    return (
      props.artifact ??
      props.latestArtifact ??
      props.artifacts?.slice().sort((left, right) => right.revision - left.revision)[0] ??
      null
    );
  }

  return (
    props.artifacts?.find((artifact) => artifact.revision === scrubRevision) ??
    props.artifact ??
    props.latestArtifact ??
    null
  );
}

export function sourceProjectionMessage(
  sourceState: string,
  sourceMessage: string | null,
): string | null {
  if (sourceState === "valid") return null;
  if (sourceState === "missing") {
    return "No project understanding source yet. Waiting for observation.";
  }
  return sourceMessage;
}
