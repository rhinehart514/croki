const STORAGE_KEY = "drover:repository-browser:v1";
const MAX_THREADS = 20;

export type RepositoryBrowserPresentation = {
  open: boolean;
  path: string | null;
  directory: string;
  query: string;
  startLine: number;
  endLine: number;
  at: number;
};

const EMPTY: RepositoryBrowserPresentation = {
  open: false,
  path: null,
  directory: "",
  query: "",
  startLine: 1,
  endLine: 1,
  at: 0,
};

function valid(value: unknown): RepositoryBrowserPresentation {
  if (!value || typeof value !== "object") return EMPTY;
  const input = value as Partial<RepositoryBrowserPresentation>;
  return {
    open: Boolean(input.open),
    path: typeof input.path === "string" && input.path ? input.path : null,
    directory: typeof input.directory === "string" ? input.directory : "",
    query: typeof input.query === "string" ? input.query : "",
    startLine: Number.isSafeInteger(input.startLine) && input.startLine! > 0 ? input.startLine! : 1,
    endLine: Number.isSafeInteger(input.endLine) && input.endLine! > 0 ? input.endLine! : 1,
    at: typeof input.at === "number" ? input.at : 0,
  };
}

function readAll() {
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<string, unknown>;
    return Object.fromEntries(Object.entries(value).map(([threadRef, entry]) => [threadRef, valid(entry)]));
  } catch {
    return {} as Record<string, RepositoryBrowserPresentation>;
  }
}

export function readRepositoryPresentation(threadRef: string) {
  return readAll()[threadRef] ?? EMPTY;
}

export function writeRepositoryPresentation(
  threadRef: string,
  patch: Partial<Omit<RepositoryBrowserPresentation, "at">>,
) {
  const all = readAll();
  const next = { ...(all[threadRef] ?? EMPTY), ...patch, at: Date.now() };
  const bounded = Object.entries({ ...all, [threadRef]: next })
    .sort((left, right) => right[1].at - left[1].at)
    .slice(0, MAX_THREADS);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(bounded)));
  } catch {
    // Presentation memory is disposable; durable Thread and repository truth are untouched.
  }
  return next;
}
