import type { EnvironmentId } from "@croki/contracts";
import { Globe, RadioTower } from "lucide-react";

import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from "~/components/ui/empty";

import { PreviewLocalServerCard } from "./PreviewLocalServerCard";
import { useDiscoveredLocalServers } from "./useDiscoveredLocalServers";

interface Props {
  environmentId: EnvironmentId;
  configuredUrls?: ReadonlyArray<string> | undefined;
  recentlySeenUrls?: ReadonlyArray<string> | undefined;
  onOpenUrl: (url: string) => void;
}

export function PreviewEmptyState({
  environmentId,
  configuredUrls,
  recentlySeenUrls,
  onOpenUrl,
}: Props) {
  const servers = useDiscoveredLocalServers({
    environmentId,
    configuredUrls,
    recentlySeenUrls,
  });

  return (
    <div className="flex h-full min-h-0 overflow-y-auto px-5 py-8">
      <div className="m-auto flex w-full max-w-xl flex-col gap-5">
        <div>
          <h2 className="text-base font-medium text-foreground">Open a running app</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Listening localhost ports appear here automatically.
          </p>
        </div>

        {servers.length > 0 ? (
          <div className="flex flex-col gap-3">
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
          <Empty className="min-h-48 border-0 p-0">
            <EmptyMedia variant="icon">
              <Globe className="size-4.5 text-muted-foreground" />
            </EmptyMedia>
            <EmptyTitle>No app is running</EmptyTitle>
            <EmptyDescription>
              Start the project dev script. Croki will show its listening port here.
            </EmptyDescription>
          </Empty>
        )}
      </div>
    </div>
  );
}
