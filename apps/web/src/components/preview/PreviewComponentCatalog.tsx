import type { EnvironmentId, ProjectComponentEntry } from "@croki/contracts";
import { Code2, RefreshCw, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { useProjectComponentsQuery } from "~/components/files/projectFilesQueryState";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";

interface Props {
  environmentId: EnvironmentId;
  cwd: string;
  busy: boolean;
  onPreview: (component: ProjectComponentEntry) => void;
}

export function PreviewComponentCatalog({ environmentId, cwd, busy, onPreview }: Props) {
  const [query, setQuery] = useState("");
  const result = useProjectComponentsQuery(environmentId, cwd);
  const components = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return result.data?.components ?? [];
    return (result.data?.components ?? []).filter(
      (component) =>
        component.displayName.toLowerCase().includes(normalizedQuery) ||
        component.path.toLowerCase().includes(normalizedQuery),
    );
  }, [query, result.data?.components]);

  if (result.isPending && !result.data) {
    return (
      <div className="flex min-h-48 items-center gap-2 text-sm text-muted-foreground" role="status">
        <RefreshCw className="size-4 animate-spin" />
        Finding components…
      </div>
    );
  }

  if (result.error) {
    return (
      <div className="flex min-h-48 flex-col items-start justify-center gap-3" role="alert">
        <div>
          <p className="text-sm font-medium text-foreground">Components could not be indexed</p>
          <p className="mt-1 text-sm text-muted-foreground">{result.error}</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={result.refresh}>
          Try again
        </Button>
      </div>
    );
  }

  if ((result.data?.components.length ?? 0) === 0) {
    return (
      <div className="flex min-h-48 flex-col items-start justify-center gap-2">
        <Code2 className="size-5 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium text-foreground">No UI components found</p>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            Export a React, Vue, or Svelte component and it will appear here automatically.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-col gap-3" role="tabpanel">
      <label className="text-sm font-medium text-foreground" htmlFor="preview-component-search">
        Find a component
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 z-10 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          id="preview-component-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by component name"
          className="pl-7.5"
          autoFocus
        />
      </div>
      <div className="max-h-72 overflow-y-auto rounded-lg border border-border/70">
        {components.length > 0 ? (
          <div className="divide-y divide-border/60">
            {components.map((component) => (
              <button
                key={component.id}
                type="button"
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left outline-none transition-colors hover:bg-muted/60 focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:opacity-50"
                onClick={() => onPreview(component)}
                disabled={busy}
                aria-label={`Preview ${component.displayName}`}
              >
                <Code2 className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {component.displayName}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {component.path}
                  </span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {busy ? "Building…" : "Preview"}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">
            No components match “{query.trim()}”.
          </p>
        )}
      </div>
      {result.data?.truncated ? (
        <p className="text-xs text-muted-foreground">Showing the most likely product components.</p>
      ) : null}
    </div>
  );
}
