// Portions Copyright (c) 2026 T3 Tools Inc. Licensed under MIT (github.com/pingdotgg/t3code).
// Shared syntax-highlighting worker pool for every diff rendered in the workspace. Mounted once at
// the venture-workspace root so Work changes, review workspaces, and decision gates reuse the same
// workers and AST cache. Where Workers don't exist (jsdom tests), children render unchanged and
// @pierre/diffs falls back to main-thread highlighting.

import { useMemo, type ReactNode } from "react";
import { WorkerPoolContextProvider } from "@pierre/diffs/react";
import DiffsWorker from "@pierre/diffs/worker/worker.js?worker";
import { DIFF_THEME_NAME } from "./diffRendering";

export function DiffWorkerPoolProvider({ children }: { children?: ReactNode }) {
  const workerPoolSize = useMemo(() => {
    const cores =
      typeof navigator === "undefined" ? 4 : Math.max(1, navigator.hardwareConcurrency || 4);
    return Math.max(2, Math.min(6, Math.floor(cores / 2)));
  }, []);

  if (typeof Worker === "undefined") {
    return <>{children}</>;
  }

  return (
    <WorkerPoolContextProvider
      poolOptions={{
        workerFactory: () => new DiffsWorker(),
        poolSize: workerPoolSize,
        totalASTLRUCacheSize: 240,
      }}
      highlighterOptions={{
        theme: DIFF_THEME_NAME,
        tokenizeMaxLineLength: 1_000,
        useTokenTransformer: true,
      }}
    >
      {children}
    </WorkerPoolContextProvider>
  );
}
