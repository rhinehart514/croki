import { type EnvironmentId, type ProjectInvitationAcceptInput } from "@croki/contracts";
import { LoaderIcon, UsersIcon } from "lucide-react";
import { useCallback, useState, type ReactNode } from "react";

import { APP_DISPLAY_NAME } from "../../branding";
import { useEnvironmentQuery } from "../../state/query";
import { peopleEnvironment } from "../../state/people";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { CrokiSurfaceBrand } from "./CrokiSurfaceBrand";

function errorMessage(cause: unknown): string {
  if (cause instanceof Error && cause.message.trim()) return cause.message;
  return "This invitation could not be accepted.";
}

function surfaceShell(children: ReactNode) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10 text-foreground sm:px-6">
      <div className="pointer-events-none absolute inset-0 opacity-80">
        <div className="absolute inset-x-0 top-0 h-44 bg-[radial-gradient(44rem_16rem_at_top,color-mix(in_srgb,var(--color-emerald-500)_14%,transparent),transparent)]" />
        <div className="absolute inset-y-0 left-0 w-72 bg-[radial-gradient(28rem_18rem_at_left,color-mix(in_srgb,var(--color-sky-500)_10%,transparent),transparent)]" />
        <div className="absolute inset-0 bg-[linear-gradient(145deg,color-mix(in_srgb,var(--background)_90%,var(--color-black))_0%,var(--background)_55%)]" />
      </div>
      <section className="relative w-full max-w-xl rounded-2xl border border-border/80 bg-card/90 p-6 shadow-2xl shadow-black/20 backdrop-blur-md sm:p-8">
        <CrokiSurfaceBrand displayName={APP_DISPLAY_NAME} />
        {children}
      </section>
    </div>
  );
}

export function ProjectInvitationSurface({
  environmentId,
  secret,
  authenticated,
  onOpenPairing,
  onAccepted,
}: {
  readonly environmentId: EnvironmentId;
  readonly secret: string;
  readonly authenticated: boolean;
  readonly onOpenPairing: () => void;
  readonly onAccepted: () => void;
}) {
  const identity = useEnvironmentQuery(peopleEnvironment.current({ environmentId, input: {} }));
  const acceptInvitation = useAtomCommand(peopleEnvironment.acceptInvitation, {
    reportFailure: false,
  });
  const register = useAtomCommand(peopleEnvironment.register, { reportFailure: false });
  const [displayName, setDisplayName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accept = useCallback(async () => {
    if (isSubmitting) return;
    setError(null);
    setIsSubmitting(true);
    const result = await acceptInvitation({
      environmentId,
      input: { secret } satisfies ProjectInvitationAcceptInput,
    });
    setIsSubmitting(false);
    if (result._tag === "Failure") {
      setError(errorMessage(result.cause));
      return;
    }
    onAccepted();
  }, [acceptInvitation, environmentId, isSubmitting, onAccepted, secret]);

  const registerAndAccept = useCallback(async () => {
    const name = displayName.trim();
    if (!name || isSubmitting) return;
    setError(null);
    setIsSubmitting(true);
    const registered = await register({
      environmentId,
      input: { displayName: name, deviceLabel: "Web browser", deviceType: "desktop" },
    });
    if (registered._tag === "Failure") {
      setIsSubmitting(false);
      setError(errorMessage(registered.cause));
      return;
    }
    const accepted = await acceptInvitation({ environmentId, input: { secret } });
    setIsSubmitting(false);
    if (accepted._tag === "Failure") {
      setError(errorMessage(accepted.cause));
      return;
    }
    onAccepted();
  }, [acceptInvitation, displayName, environmentId, isSubmitting, onAccepted, register, secret]);

  if (!authenticated) {
    return surfaceShell(
      <>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
          Join this Project
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Connect to this Croki environment, then accept the one-use invitation.
        </p>
        <Button className="mt-6" onClick={onOpenPairing}>
          Connect to Croki
        </Button>
      </>,
    );
  }

  const hasIdentity =
    identity.data !== null && identity.data.person !== null && identity.data.device !== null;
  return surfaceShell(
    <>
      <div className="mt-3 flex items-center gap-2">
        <UsersIcon className="size-5 text-muted-foreground" />
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Join this Project</h1>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        You will be able to enter every shared Thread and see the work as it happens.
      </p>
      {!hasIdentity ? (
        <div className="mt-6 space-y-3">
          <label className="text-sm font-medium" htmlFor="invitation-display-name">
            Your name
          </label>
          <Input
            id="invitation-display-name"
            autoComplete="name"
            disabled={isSubmitting}
            nativeInput
            onChange={(event) => setDisplayName(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void registerAndAccept();
            }}
            placeholder="e.g. Alex"
            value={displayName}
          />
        </div>
      ) : null}
      {error ? (
        <div className="mt-5 rounded-lg border border-destructive/30 bg-destructive/6 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}
      <Button
        className="mt-6"
        disabled={isSubmitting || (!hasIdentity && !displayName.trim())}
        onClick={() => void (hasIdentity ? accept() : registerAndAccept())}
      >
        {isSubmitting ? <LoaderIcon className="animate-spin" /> : null}
        {isSubmitting ? "Joining…" : "Accept invitation"}
      </Button>
    </>,
  );
}
