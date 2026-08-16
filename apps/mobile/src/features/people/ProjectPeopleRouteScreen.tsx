import { type StaticScreenProps, useNavigation } from "@react-navigation/native";
import { EnvironmentId, ProjectId } from "@croki/contracts";
import { useCallback, useMemo, useState } from "react";
import { Alert, Platform, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AndroidScreenHeader } from "../../components/AndroidScreenHeader";
import { AppText as Text, AppTextInput as TextInput } from "../../components/AppText";
import { NativeStackScreenOptions } from "../../native/StackHeader";
import { copyTextWithHaptic } from "../../lib/copyTextWithHaptic";
import { useSavedRemoteConnection } from "../../state/use-remote-environment-registry";
import { useEnvironmentQuery } from "../../state/query";
import { peopleEnvironment } from "../../state/people";
import { useAtomCommand } from "../../state/use-atom-command";
import { ActionButton, InvitationRow, MemberRow } from "./ProjectPeopleRows";

type ProjectPeopleRouteProps = StaticScreenProps<{
  readonly environmentId: string;
  readonly projectId: string;
}>;

const INVITATION_TTL_SECONDS = 7 * 24 * 60 * 60;

function failureMessage(cause: unknown): string {
  return cause instanceof Error && cause.message.trim().length > 0
    ? cause.message
    : "The Project People action could not be completed.";
}

function invitationLink(
  secret: string,
  environmentId: EnvironmentId,
  displayUrl: string | null,
): string {
  const path = `/invite/${encodeURIComponent(secret)}?environmentId=${encodeURIComponent(environmentId)}`;
  if (!displayUrl) return path;
  return `${displayUrl.replace(/\/+$/, "")}${path}`;
}

export function ProjectPeopleRouteScreen({ route }: ProjectPeopleRouteProps) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const environmentId = EnvironmentId.make(route.params.environmentId);
  const projectId = ProjectId.make(route.params.projectId);
  const environment = useSavedRemoteConnection(environmentId);
  const identity = useEnvironmentQuery(peopleEnvironment.current({ environmentId, input: {} }));
  const members = useEnvironmentQuery(
    peopleEnvironment.members({ environmentId, input: { projectId } }),
  );
  const invitations = useEnvironmentQuery(
    peopleEnvironment.invitations({ environmentId, input: { projectId } }),
  );
  const register = useAtomCommand(peopleEnvironment.register, { reportFailure: false });
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
  const [displayName, setDisplayName] = useState("");
  const [inviteValue, setInviteValue] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const currentPerson = identity.data?.person ?? null;
  const memberList = members.data?.members ?? [];
  const currentMembership = memberList.find(
    (member) => member.personId === currentPerson?.personId,
  );
  const isOwner = currentMembership?.role === "owner";
  const hasIdentity =
    identity.data !== null && identity.data.person !== null && identity.data.device !== null;
  const activeInvitations = useMemo(
    () =>
      invitations.data?.invitations.filter((invitation) => invitation.state === "created") ?? [],
    [invitations.data?.invitations],
  );

  const refreshPeople = useCallback(() => {
    members.refresh();
    invitations.refresh();
  }, [invitations, members]);

  const showFailure = useCallback((cause: unknown) => {
    Alert.alert("Project People", failureMessage(cause));
  }, []);

  const submitRegistration = useCallback(async () => {
    const name = displayName.trim();
    if (!name || busy) return;
    setBusy(true);
    const result = await register({
      environmentId,
      input: { displayName: name, deviceLabel: "Mobile app", deviceType: "mobile" },
    });
    setBusy(false);
    if (result._tag === "Failure") {
      showFailure(result.cause);
      return;
    }
    identity.refresh();
    refreshPeople();
  }, [busy, displayName, environmentId, identity, refreshPeople, register, showFailure]);

  const runAction = useCallback(
    async (action: () => Promise<{ readonly _tag: string; readonly cause?: unknown }>) => {
      if (busy) return;
      setBusy(true);
      const result = await action();
      setBusy(false);
      if (result._tag === "Failure") {
        showFailure(result.cause);
        return;
      }
      refreshPeople();
    },
    [busy, refreshPeople, showFailure],
  );

  const createAndCopyInvitation = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    const result = await createInvitation({
      environmentId,
      input: { projectId, ttlSeconds: INVITATION_TTL_SECONDS },
    });
    setBusy(false);
    if (result._tag === "Failure") {
      showFailure(result.cause);
      return;
    }
    const value = invitationLink(
      result.value.secret,
      environmentId,
      environment?.displayUrl ?? null,
    );
    setInviteValue(value);
    copyTextWithHaptic(value, { target: "Project invitation" });
    refreshPeople();
    Alert.alert("Invitation copied", "This link can be opened once and expires in 7 days.");
  }, [
    busy,
    createInvitation,
    environment?.displayUrl,
    environmentId,
    projectId,
    refreshPeople,
    showFailure,
  ]);

  const content = !hasIdentity ? (
    <View className="gap-4 rounded-[24px] bg-card p-5">
      <View className="gap-1">
        <Text className="text-xl font-t3-bold text-foreground">Choose your name</Text>
        <Text className="text-sm leading-5 text-foreground-muted">
          People in this Project will see this name.
        </Text>
      </View>
      <TextInput
        autoCapitalize="words"
        autoComplete="name"
        editable={!busy}
        onChangeText={setDisplayName}
        onSubmitEditing={() => void submitRegistration()}
        placeholder="e.g. Alex"
        returnKeyType="done"
        value={displayName}
      />
      <ActionButton
        disabled={busy || displayName.trim().length === 0}
        label={busy ? "Setting up…" : "Continue"}
        onPress={() => void submitRegistration()}
      />
    </View>
  ) : members.data === null ? (
    <View className="gap-4 rounded-[24px] bg-card p-5">
      <View className="gap-1">
        <Text className="text-xl font-t3-bold text-foreground">Share this Project</Text>
        <Text className="text-sm leading-5 text-foreground-muted">
          Invite people into the same Threads and evidence.
        </Text>
      </View>
      <ActionButton
        disabled={busy || members.isPending}
        label={members.isPending ? "Checking…" : "Start sharing"}
        onPress={() => void runAction(() => ensureOwner({ environmentId, input: { projectId } }))}
      />
    </View>
  ) : (
    <View className="gap-5">
      <View className="gap-2">
        <Text className="px-2 text-sm font-t3-medium text-foreground-muted">People</Text>
        <View className="overflow-hidden rounded-[24px] bg-card">
          {memberList.map((member) => (
            <MemberRow
              key={member.personId}
              isCurrentPerson={member.personId === currentPerson?.personId}
              isOwner={isOwner}
              member={member}
              onRemove={() =>
                Alert.alert(
                  "Remove member?",
                  `Remove ${member.displayName} from this Project? They will lose access to shared Threads.`,
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Remove",
                      style: "destructive",
                      onPress: () =>
                        void runAction(() =>
                          removeMember({
                            environmentId,
                            input: { projectId, personId: member.personId },
                          }),
                        ),
                    },
                  ],
                )
              }
              onTransfer={() =>
                Alert.alert(
                  "Transfer ownership?",
                  `Make ${member.displayName} the owner? You will become a Member and lose owner-only controls.`,
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Transfer",
                      onPress: () =>
                        void runAction(() =>
                          transferOwnership({
                            environmentId,
                            input: { projectId, personId: member.personId },
                          }),
                        ),
                    },
                  ],
                )
              }
            />
          ))}
        </View>
      </View>
      {isOwner ? (
        <View className="gap-2">
          <Text className="px-2 text-sm font-t3-medium text-foreground-muted">Invite</Text>
          <View className="gap-3 rounded-[24px] bg-card p-4">
            <View className="gap-1">
              <Text className="text-base font-t3-medium text-foreground">One-use invitation</Text>
              <Text className="text-sm leading-5 text-foreground-muted">
                Create a link, then send it to someone you trust. It expires in 7 days.
              </Text>
            </View>
            <ActionButton
              disabled={busy}
              label={busy ? "Creating…" : "Create and copy link"}
              onPress={() => void createAndCopyInvitation()}
            />
            {inviteValue ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Copy invitation link again"
                onPress={() => copyTextWithHaptic(inviteValue, { target: "Project invitation" })}
                className="rounded-xl bg-subtle px-3 py-2"
              >
                <Text className="text-xs text-foreground-muted" numberOfLines={2}>
                  {inviteValue}
                </Text>
              </Pressable>
            ) : null}
          </View>
          {activeInvitations.length > 0 ? (
            <View className="overflow-hidden rounded-[24px] bg-card">
              {activeInvitations.map((invitation) => (
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
            </View>
          ) : null}
        </View>
      ) : null}
      {members.error ? <Text className="px-2 text-sm text-danger">{members.error}</Text> : null}
    </View>
  );

  return (
    <View className="flex-1 bg-screen">
      <NativeStackScreenOptions
        options={{
          headerShown: Platform.OS !== "android",
          title: "Project People",
        }}
      />
      {Platform.OS === "android" ? (
        <AndroidScreenHeader title="Project People" onBack={() => navigation.goBack()} />
      ) : null}
      <ScrollView
        contentContainerStyle={{
          gap: 20,
          paddingBottom: Math.max(insets.bottom, 20) + 24,
          paddingHorizontal: 20,
          paddingTop: 20,
        }}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View className="gap-1">
          <Text className="text-2xl font-t3-bold text-foreground">Project People</Text>
          <Text className="text-sm leading-5 text-foreground-muted">
            See who can enter this Project and share the work in one place.
          </Text>
        </View>
        {content}
      </ScrollView>
    </View>
  );
}
