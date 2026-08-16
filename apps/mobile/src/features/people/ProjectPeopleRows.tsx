import type { ProjectInvitation, ProjectMember } from "@croki/contracts";
import { Pressable, View } from "react-native";

import { AppText as Text } from "../../components/AppText";

export function ActionButton(props: {
  readonly label: string;
  readonly onPress: () => void;
  readonly disabled?: boolean;
  readonly destructive?: boolean;
  readonly compact?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.label}
      disabled={props.disabled}
      onPress={props.onPress}
      className={`rounded-full ${props.compact ? "px-3 py-2" : "px-4 py-3"} ${
        props.destructive ? "bg-danger/12" : "bg-subtle"
      } ${props.disabled ? "opacity-50" : ""}`}
    >
      <Text
        className={`text-sm font-t3-bold ${props.destructive ? "text-danger" : "text-foreground"}`}
      >
        {props.label}
      </Text>
    </Pressable>
  );
}

export function MemberRow(props: {
  readonly member: ProjectMember;
  readonly isCurrentPerson: boolean;
  readonly isOwner: boolean;
  readonly onTransfer: () => void;
  readonly onRemove: () => void;
}) {
  const initial = props.member.displayName.trim().slice(0, 1).toUpperCase();
  const isMemberOwner = props.member.role === "owner";

  return (
    <View className="flex-row items-center gap-3 border-b border-border px-4 py-3 last:border-b-0">
      <View
        className={`size-10 items-center justify-center rounded-full ${
          isMemberOwner ? "bg-warning/15" : "bg-subtle"
        }`}
      >
        <Text className="text-base font-t3-bold text-foreground">{initial}</Text>
      </View>
      <View className="min-w-0 flex-1">
        <View className="flex-row items-center gap-2">
          <Text className="shrink text-base font-t3-medium text-foreground" numberOfLines={1}>
            {props.member.displayName}
          </Text>
          {props.isCurrentPerson ? (
            <Text className="text-xs text-foreground-muted">You</Text>
          ) : null}
        </View>
        <Text className="mt-0.5 text-sm text-foreground-muted">
          {isMemberOwner ? "Owner" : "Member"}
        </Text>
      </View>
      {props.isOwner && !props.isCurrentPerson && !isMemberOwner ? (
        <View className="items-end gap-1">
          <ActionButton compact label="Make owner" onPress={props.onTransfer} />
          <ActionButton compact destructive label="Remove" onPress={props.onRemove} />
        </View>
      ) : null}
    </View>
  );
}

export function InvitationRow(props: {
  readonly invitation: ProjectInvitation;
  readonly onRevoke: () => void;
}) {
  const label =
    props.invitation.state === "created"
      ? `Expires ${new Date(props.invitation.expiresAt).toLocaleDateString()}`
      : props.invitation.state[0]!.toUpperCase() + props.invitation.state.slice(1);

  return (
    <View className="flex-row items-center gap-3 border-b border-border px-4 py-3 last:border-b-0">
      <View className="min-w-0 flex-1">
        <Text className="text-base font-t3-medium text-foreground">One-use invitation</Text>
        <Text className="mt-0.5 text-sm text-foreground-muted">{label}</Text>
      </View>
      {props.invitation.state === "created" ? (
        <ActionButton compact label="Revoke" onPress={props.onRevoke} />
      ) : null}
    </View>
  );
}
