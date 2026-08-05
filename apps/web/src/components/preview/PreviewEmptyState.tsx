import type { EnvironmentId, ProjectComponentEntry } from "@croki/contracts";
import { Globe, RadioTower, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "~/components/ui/button";
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from "~/components/ui/empty";
import { Textarea } from "~/components/ui/textarea";
import { cn } from "~/lib/utils";

import { PreviewLocalServerCard } from "./PreviewLocalServerCard";
import { PreviewComponentCatalog } from "./PreviewComponentCatalog";
import { useDiscoveredLocalServers } from "./useDiscoveredLocalServers";

interface Props {
  environmentId: EnvironmentId;
  configuredUrls?: ReadonlyArray<string> | undefined;
  recentlySeenUrls?: ReadonlyArray<string> | undefined;
  onOpenUrl: (url: string) => void;
  onBuildIdea?: ((idea: string) => void) | undefined;
  workspaceRoot?: string | undefined;
  onPreviewComponent?: ((component: ProjectComponentEntry) => void) | undefined;
  explorationBusy?: boolean | undefined;
}

export function PreviewEmptyState({
  environmentId,
  configuredUrls,
  recentlySeenUrls,
  onOpenUrl,
  onBuildIdea,
  workspaceRoot,
  onPreviewComponent,
  explorationBusy = false,
}: Props) {
  const [mode, setMode] = useState<"app" | "component" | "idea">("app");
  const [idea, setIdea] = useState("");
  const explorationAvailable = onBuildIdea !== undefined || onPreviewComponent !== undefined;
  useEffect(() => {
    if (!explorationAvailable) setMode("app");
  }, [explorationAvailable]);
  const servers = useDiscoveredLocalServers({
    environmentId,
    configuredUrls,
    recentlySeenUrls,
  });

  return (
    <div className="flex h-full min-h-0 overflow-y-auto px-5 py-8">
      <div className="m-auto flex w-full max-w-xl flex-col gap-5">
        <div>
          <h2 className="text-base font-medium text-foreground">
            {explorationAvailable ? "What do you want to preview?" : "Open a running app"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {explorationAvailable
              ? "Open the running app, isolate a component, or build an idea as working code."
              : "Listening localhost ports appear here automatically."}
          </p>
        </div>

        {explorationAvailable ? (
          <div className="flex border-b border-border" role="tablist" aria-label="Preview source">
            {(["app", "component", "idea"] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={mode === value}
                className={cn(
                  "-mb-px min-h-9 border-b px-3 text-sm capitalize outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                  mode === value
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
                onClick={() => setMode(value)}
              >
                {value}
              </button>
            ))}
          </div>
        ) : null}

        {mode === "app" ? (
          servers.length > 0 ? (
            <div className="flex flex-col gap-3" role="tabpanel">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <RadioTower className="size-4 shrink-0" />
                <span>Running locally</span>
              </div>
              <div className="flex flex-col divide-y divide-border/60 overflow-hidden rounded-lg border border-border/70 bg-background">
                {servers.map((server) => (
                  <PreviewLocalServerCard
                    key={`${server.host}:${server.port}`}
                    server={server}
                    onOpen={() => onOpenUrl(server.url)}
                  />
                ))}
              </div>
            </div>
          ) : (
            <Empty className="min-h-48 border-0 p-0" role="tabpanel">
              <EmptyMedia variant="icon">
                <Globe className="size-4.5 text-muted-foreground" />
              </EmptyMedia>
              <EmptyTitle>No app is running</EmptyTitle>
              <EmptyDescription>
                Start the project dev script. Croki will show its listening port here.
              </EmptyDescription>
            </Empty>
          )
        ) : mode === "component" ? (
          workspaceRoot && onPreviewComponent ? (
            <PreviewComponentCatalog
              environmentId={environmentId}
              cwd={workspaceRoot}
              busy={explorationBusy}
              onPreview={onPreviewComponent}
            />
          ) : null
        ) : (
          <form
            className="flex min-h-48 flex-col gap-3"
            role="tabpanel"
            onSubmit={(event) => {
              event.preventDefault();
              const nextIdea = idea.trim();
              if (!nextIdea || explorationBusy) return;
              onBuildIdea?.(nextIdea);
            }}
          >
            <label htmlFor="preview-idea" className="text-sm font-medium text-foreground">
              What should exist?
            </label>
            <Textarea
              id="preview-idea"
              value={idea}
              onChange={(event) => setIdea(event.target.value)}
              placeholder="A settings search that previews each result before navigating"
              rows={4}
              disabled={explorationBusy}
              autoFocus
            />
            <Button
              type="submit"
              size="sm"
              className="self-start"
              disabled={!idea.trim() || explorationBusy || !onBuildIdea}
            >
              <Sparkles />
              {explorationBusy ? "Building…" : "Build in Preview"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
