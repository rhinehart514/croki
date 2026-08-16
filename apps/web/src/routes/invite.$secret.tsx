import { EnvironmentId, type EnvironmentId as EnvironmentIdType } from "@croki/contracts";
import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { ProjectInvitationSurface } from "../components/auth/ProjectInvitationSurface";
import { usePrimaryEnvironmentId } from "../state/environments";

type InvitationSearch = {
  readonly environmentId?: EnvironmentIdType;
};

export const Route = createFileRoute("/invite/$secret")({
  validateSearch: (raw: Record<string, unknown>): InvitationSearch =>
    typeof raw.environmentId === "string" && raw.environmentId.length > 0
      ? { environmentId: EnvironmentId.make(raw.environmentId) }
      : {},
  component: ProjectInvitationRoute,
});

function ProjectInvitationRoute() {
  const { secret } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const authenticated = Route.useRouteContext().authGateState.status === "authenticated";
  const environmentId = search.environmentId ?? usePrimaryEnvironmentId();

  if (environmentId === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6 text-sm text-muted-foreground">
        Connect to the invited Croki environment, then open this link again.
      </div>
    );
  }

  return (
    <ProjectInvitationSurface
      authenticated={authenticated}
      environmentId={environmentId}
      onAccepted={() => void navigate({ to: "/", replace: true })}
      onOpenPairing={() => {
        const returnTo = `/invite/${encodeURIComponent(secret)}${
          search.environmentId ? `?environmentId=${encodeURIComponent(search.environmentId)}` : ""
        }`;
        window.location.assign(`/pair?returnTo=${encodeURIComponent(returnTo)}`);
      }}
      secret={decodeURIComponent(secret)}
    />
  );
}
