import { type ProjectInvitation, type ProjectMember } from "@croki/contracts";
import { CrownIcon, LinkIcon, UserMinusIcon } from "lucide-react";

import { cn } from "../../lib/utils";
import { Button } from "../ui/button";

export function MemberRow({
  member,
  isCurrentPerson,
  isOwner,
  onRemove,
  onTransfer,
}: {
  readonly member: ProjectMember;
  readonly isCurrentPerson: boolean;
  readonly isOwner: boolean;
  readonly onRemove: () => void;
  readonly onTransfer: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl px-3 py-2.5 sm:px-4">
      <span
        aria-hidden
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
          member.role === "owner"
            ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
            : "bg-muted text-muted-foreground",
        )}
      >
        {member.displayName.slice(0, 1).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm font-medium">
          <span className="truncate">{member.displayName}</span>
          {isCurrentPerson ? (
            <span className="shrink-0 text-xs font-normal text-muted-foreground">You</span>
          ) : null}
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          {member.role === "owner" ? <CrownIcon className="size-3" /> : null}
          {member.role === "owner" ? "Owner" : "Member"}
        </div>
      </div>
      {isOwner && !isCurrentPerson && member.role !== "owner" ? (
        <div className="flex shrink-0 gap-1">
          <Button
            aria-label={`Make ${member.displayName} owner`}
            onClick={onTransfer}
            size="xs"
            variant="ghost"
          >
            Make owner
          </Button>
          <Button
            aria-label={`Remove ${member.displayName}`}
            onClick={onRemove}
            size="icon-xs"
            variant="ghost"
          >
            <UserMinusIcon />
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function InvitationRow({
  invitation,
  onRevoke,
}: {
  readonly invitation: ProjectInvitation;
  readonly onRevoke: () => void;
}) {
  const label =
    invitation.state === "created"
      ? `Expires ${new Date(invitation.expiresAt).toLocaleDateString()}`
      : invitation.state[0]!.toUpperCase() + invitation.state.slice(1);
  return (
    <div className="flex items-center gap-3 rounded-xl px-3 py-2.5 sm:px-4">
      <LinkIcon className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">One-use invitation</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </div>
      {invitation.state === "created" ? (
        <Button onClick={onRevoke} size="xs" variant="ghost">
          Revoke
        </Button>
      ) : null}
    </div>
  );
}
