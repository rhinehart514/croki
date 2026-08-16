import { type EnvironmentId, type ProjectId } from "@croki/contracts";
import { CheckIcon, ClipboardIcon, LoaderIcon, UserPlusIcon } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { useCopyToClipboard } from "../../hooks/useCopyToClipboard";
import { useEnvironmentQuery } from "../../state/query";
import { peopleEnvironment } from "../../state/people";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { SettingsRow, SettingsSection } from "./settingsLayout";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { InvitationRow, MemberRow } from "./ProjectPeopleRows";

const INVITATION_TTL_SECONDS = 7 * 24 * 60 * 60;

type PeopleTarget = {
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId;
};

function invitationUrl(secret: string, environmentId: EnvironmentId): string {
  const path = `/invite/${encodeURIComponent(secret)}`;
  if (typeof window === "undefined") {
    return `${path}?environmentId=${encodeURIComponent(environmentId)}`;
  }
  const url = new URL(path, window.location.origin);
  url.searchParams.set("environmentId", environmentId);
  return url.toString();
}

function copyErrorToast(title: string, error: unknown) {
  toastManager.add(
    stackedThreadToast({
      type: "error",
      title,
      description: error instanceof Error ? error.message : "An error occurred.",
    }),
  );
}

function RegistrationRow({
  target,
  onRegistered,
}: {
  readonly target: PeopleTarget;
  readonly onRegistered: () => void;
}) {
  const [displayName, setDisplayName] = useState("");
  const register = useAtomCommand(peopleEnvironment.register, { reportFailure: false });
  const [isRegistering, setIsRegistering] = useState(false);

  const submit = useCallback(async () => {
    const name = displayName.trim();
    if (!name || isRegistering) return;
    setIsRegistering(true);
    const result = await register({
      environmentId: target.environmentId,
      input: {
        displayName: name,
        deviceLabel: "Web browser",
        deviceType: "desktop",
      },
    });
    setIsRegistering(false);
    if (result._tag === "Failure") {
      copyErrorToast("Could not set up your identity", result.cause);
      return;
    }
    onRegistered();
  }, [displayName, isRegistering, onRegistered, register, target.environmentId]);

  return (
    <SettingsRow
      title="Your name"
      description="Choose the name other people will see in this Project."
      control={
        <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:max-w-sm sm:justify-end">
          <Input
            aria-label="Your name"
            className="min-w-44 flex-1 sm:w-48"
            disabled={isRegistering}
            nativeInput
            onChange={(event) => setDisplayName(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void submit();
            }}
            placeholder="e.g. Alex"
            value={displayName}
          />
          <Button disabled={!displayName.trim() || isRegistering} onClick={() => void submit()}>
            {isRegistering ? <LoaderIcon className="animate-spin" /> : null}
            Continue
          </Button>
        </div>
      }
    />
  );
}

export function ProjectPeoplePanel({ environmentId, projectId }: PeopleTarget) {
  const target = useMemo(() => ({ environmentId, projectId }), [environmentId, projectId]);
  const identity = useEnvironmentQuery(peopleEnvironment.current({ environmentId, input: {} }));
  const members = useEnvironmentQuery(
    peopleEnvironment.members({ environmentId, input: { projectId } }),
  );
  const invitations = useEnvironmentQuery(
    peopleEnvironment.invitations({ environmentId, input: { projectId } }),
  );
  const refreshIdentity = identity.refresh;
  const refreshMembers = members.refresh;
  const refreshInvitations = invitations.refresh;
  const ensureOwner = useAtomCommand(peopleEnvironment.ensureOwner, { reportFailure: false });
  const createInvitation = useAtomCommand(peopleEnvironment.createInvitation, {
    reportFailure: false,
  });
  const revokeInvitation = useAtomCommand(peopleEnvironment.revokeInvitation, {
    reportFailure: false,
  });
  const removeMember = useAtomCommand(peopleEnvironment.removeMember, { reportFailure: false });
  const transferOwnership = useAtomCommand(peopleEnvironment.transferOwnership, {
    reportFailure: false,
  });
  const [isActionPending, setIsActionPending] = useState(false);
  const [newInvitationUrl, setNewInvitationUrl] = useState<string | null>(null);
  const currentPerson = identity.data?.person ?? null;
  const memberList = members.data?.members ?? [];
  const currentMembership = memberList.find(
    (member) => member.personId === currentPerson?.personId,
  );
  const isOwner = currentMembership?.role === "owner";

  const refreshPeople = useCallback(() => {
    refreshMembers();
    refreshInvitations();
  }, [refreshInvitations, refreshMembers]);

  const runAction = useCallback(
    async (action: () => Promise<{ readonly _tag: string; readonly cause?: unknown }>) => {
      if (isActionPending) return false;
      setIsActionPending(true);
      const result = await action();
      setIsActionPending(false);
      if (result._tag === "Failure") {
        copyErrorToast("Project People action failed", result.cause);
        return false;
      }
      refreshPeople();
      return true;
    },
    [isActionPending, refreshPeople],
  );

  const createAndShowInvitation = useCallback(async () => {
    if (isActionPending) return;
    setIsActionPending(true);
    const result = await createInvitation({
      environmentId,
      input: { projectId, ttlSeconds: INVITATION_TTL_SECONDS },
    });
    setIsActionPending(false);
    if (result._tag === "Failure") {
      copyErrorToast("Could not create invitation", result.cause);
      return;
    }
    setNewInvitationUrl(invitationUrl(result.value.secret, environmentId));
    refreshPeople();
  }, [createInvitation, environmentId, isActionPending, projectId, refreshPeople]);

  const handleEnsureOwner = useCallback(
    () =>
      void runAction(() =>
        ensureOwner({ environmentId, input: { projectId } }).then((result) =>
          result._tag === "Success"
            ? { _tag: "Success" as const }
            : { _tag: "Failure" as const, cause: result.cause },
        ),
      ),
    [ensureOwner, environmentId, projectId, runAction],
  );

  const identityReady =
    identity.data !== null && identity.data.person !== null && identity.data.device !== null;
  if (!identityReady) {
    return (
      <SettingsSection title="People" icon={<UserPlusIcon className="size-4" />}>
        <RegistrationRow
          onRegistered={() => {
            refreshIdentity();
            refreshPeople();
          }}
          target={target}
        />
      </SettingsSection>
    );
  }

  return (
    <SettingsSection title="People" icon={<UserPlusIcon className="size-4" />}>
      {members.data === null ? (
        <SettingsRow
          title="Share this Project"
          description={
            members.isPending
              ? "Checking Project access…"
              : "Invite people into the same Threads and evidence."
          }
          control={
            <Button disabled={members.isPending || isActionPending} onClick={handleEnsureOwner}>
              {members.isPending ? <LoaderIcon className="animate-spin" /> : null}
              Start sharing
            </Button>
          }
        />
      ) : (
        <>
          {memberList.map((member) => (
            <MemberRow
              key={member.personId}
              isCurrentPerson={member.personId === currentPerson?.personId}
              isOwner={isOwner}
              member={member}
              onRemove={() => {
                if (!window.confirm(`Remove ${member.displayName} from this Project?`)) return;
                void runAction(() =>
                  removeMember({ environmentId, input: { projectId, personId: member.personId } }),
                );
              }}
              onTransfer={() => {
                if (
                  !window.confirm(
                    `Transfer ownership to ${member.displayName}? You will become a Member and lose owner-only controls.`,
                  )
                )
                  return;
                void runAction(() =>
                  transferOwnership({
                    environmentId,
                    input: { projectId, personId: member.personId },
                  }),
                );
              }}
            />
          ))}
          {isOwner ? (
            <SettingsRow
              title="Invite someone"
              description="The link can be opened once. Anyone with it becomes a Project Member."
              control={
                <Button disabled={isActionPending} onClick={() => void createAndShowInvitation()}>
                  {isActionPending ? <LoaderIcon className="animate-spin" /> : <UserPlusIcon />}
                  Create link
                </Button>
              }
            >
              {newInvitationUrl ? (
                <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-border/70 bg-muted/25 p-2">
                  <code className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                    {newInvitationUrl}
                  </code>
                  <InvitationCopyButton value={newInvitationUrl} />
                </div>
              ) : null}
            </SettingsRow>
          ) : null}
          {isOwner && invitations.data?.invitations.some((item) => item.state === "created") ? (
            <div className="border-t border-border/50 pt-1">
              {invitations.data.invitations
                .filter((item) => item.state === "created")
                .map((invitation) => (
                  <InvitationRow
                    key={invitation.invitationId}
                    invitation={invitation}
                    onRevoke={() =>
                      void runAction(() =>
                        revokeInvitation({
                          environmentId,
                          input: { projectId, invitationId: invitation.invitationId },
                        }),
                      )
                    }
                  />
                ))}
            </div>
          ) : null}
        </>
      )}
      {members.error && members.data !== null ? (
        <p className="px-3 text-xs text-destructive sm:px-4">{members.error}</p>
      ) : null}
    </SettingsSection>
  );
}

function InvitationCopyButton({ value }: { readonly value: string }) {
  const { copyToClipboard, isCopied } = useCopyToClipboard({
    target: "Project invitation",
    onCopy: () => toastManager.add({ type: "success", title: "Invitation link copied" }),
    onError: (error) => copyErrorToast("Could not copy invitation link", error),
  });
  return (
    <Button
      aria-label="Copy invitation link"
      onClick={() => copyToClipboard(value, undefined)}
      size="icon-xs"
      variant="ghost"
    >
      {isCopied ? <CheckIcon /> : <ClipboardIcon />}
    </Button>
  );
}
