// Artifact-review primitive kit: review the produced thing, not its explanation.

export { DiffView } from "./DiffView";
export { FilesChanged } from "./FilesChanged";
export { FileTree } from "./FileTree";
export { ArtifactPreview, type ReviewArtifact } from "./ArtifactPreview";

export {
  parseUnifiedDiff,
  diffStat,
  type DiffFile,
  type DiffHunk,
  type DiffLine,
  type DiffLineKind,
  type DiffStat,
} from "./parseDiff";

export { buildFileTree, type FileTreeNode } from "./buildFileTree";
