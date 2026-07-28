import { get } from "./transport";

export type RepositoryPresentation = "text" | "markdown" | "image" | "web" | "binary";

export type RepositoryTreeEntry = {
  path: string;
  name: string;
  kind: "directory" | "file";
  presentation: RepositoryPresentation | null;
};

export type RepositoryPage<T> = {
  workspacePath: string;
  entries: T[];
  cursor: number;
  nextCursor: number | null;
  limit: number;
  total: number;
  truncated: boolean;
};

export type RepositorySearchEntry = {
  path: string;
  name: string;
  presentation: RepositoryPresentation;
};

type RepositoryFileBase = {
  path: string;
  presentation: RepositoryPresentation;
  size: number | null;
  lineCount: number | null;
  message?: string;
};

export type RepositoryReadyTextFile = RepositoryFileBase & {
  state: "ready";
  presentation: "text" | "markdown" | "web";
  content: string;
  digest: string;
  startLine: number;
  endLine: number;
  hasMoreBefore: boolean;
  hasMoreAfter: boolean;
  ref: string;
};

export type RepositoryReadyImageFile = RepositoryFileBase & {
  state: "ready";
  presentation: "image";
  encoding: "base64";
  content: string;
  digest: string;
};

export type RepositoryUnavailableFile = RepositoryFileBase & {
  state: "binary" | "oversized" | "removed";
  digest?: string;
  limit?: number;
};

export type RepositoryFile =
  | RepositoryReadyTextFile
  | RepositoryReadyImageFile
  | RepositoryUnavailableFile;

const workspaceRepositoryPath = (ventureId: string, workspaceId: string, operation: string) =>
  `/api/ventures/${encodeURIComponent(ventureId)}/coding-workspaces/${encodeURIComponent(workspaceId)}/repository/${operation}`;
const ventureRepositoryPath = (ventureId: string, operation: string) =>
  `/api/ventures/${encodeURIComponent(ventureId)}/repository/${operation}`;

function queryString(values: Record<string, string | number | null | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== null && value !== undefined && value !== "") query.set(key, String(value));
  }
  const encoded = query.toString();
  return encoded ? `?${encoded}` : "";
}

export const getWorkspaceRepositoryTree = (
  ventureId: string,
  workspaceId: string,
  input: { path?: string; cursor?: number; limit?: number } = {},
) => get<{ tree: RepositoryPage<RepositoryTreeEntry> }>(
  `${workspaceRepositoryPath(ventureId, workspaceId, "tree")}${queryString(input)}`,
);

export const searchWorkspaceRepository = (
  ventureId: string,
  workspaceId: string,
  input: { query: string; cursor?: number; limit?: number },
) => get<{ search: RepositoryPage<RepositorySearchEntry> }>(
  `${workspaceRepositoryPath(ventureId, workspaceId, "search")}${queryString({
    q: input.query,
    cursor: input.cursor,
    limit: input.limit,
  })}`,
);

export const getWorkspaceRepositoryFile = (
  ventureId: string,
  workspaceId: string,
  input: { path: string; startLine?: number; endLine?: number | null },
) => get<{ file: RepositoryFile }>(
  `${workspaceRepositoryPath(ventureId, workspaceId, "file")}${queryString(input)}`,
);

export const getVentureRepositoryFile = (
  ventureId: string,
  input: { path: string; startLine?: number; endLine?: number | null },
) => get<{ file: RepositoryFile }>(
  `${ventureRepositoryPath(ventureId, "file")}${queryString(input)}`,
);
