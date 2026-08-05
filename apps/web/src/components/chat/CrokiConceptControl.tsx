import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@croki/client-runtime/state/runtime";
import type { EnvironmentId } from "@croki/contracts";
import type { CrokiApplication } from "@croki/shared/crokiApplication";
import {
  crokiConceptIdFromBranch,
  crokiConceptRelativePath,
  parseCrokiConceptFile,
  serializeCrokiConceptFile,
  type CrokiConceptFile,
  type CrokiConceptStatus,
} from "@croki/shared/crokiConcepts";
import { useMemo, useState } from "react";

import {
  confirmProjectFileQueryData,
  setProjectFileQueryData,
  useProjectEntriesQuery,
  useProjectFileQuery,
} from "~/components/files/projectFilesQueryState";
import { projectEnvironment } from "~/state/projects";
import { useAtomCommand } from "~/state/use-atom-command";
import { Button } from "../ui/button";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { ActiveConceptIndicator, CreateConceptDialog } from "./CrokiConceptPresentation";
import { conceptIdsFromEntries, createCrokiConcept } from "./CrokiConceptControl.logic";

export function CrokiConceptControl(props: {
  readonly environmentId: EnvironmentId;
  readonly workspaceRoot: string;
  readonly branch: string | null;
  readonly application: CrokiApplication | null;
  readonly onStartConcept: (branch: string) => Promise<void>;
}) {
  const activeId = crokiConceptIdFromBranch(props.branch);
  const activePath = activeId ? crokiConceptRelativePath(activeId) : null;
  const activeQuery = useProjectFileQuery(
    props.environmentId,
    props.workspaceRoot,
    activePath,
    props.application !== null && activePath !== null,
  );
  const entriesQuery = useProjectEntriesQuery(props.environmentId, props.workspaceRoot);
  const activeConcept = useMemo(
    () => parseConceptData(activeQuery.data?.contents),
    [activeQuery.data?.contents],
  );
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [intent, setIntent] = useState("");
  const [saving, setSaving] = useState(false);
  const writeProjectFile = useAtomCommand(projectEnvironment.writeFile, { reportFailure: false });

  if (!props.application || activeQuery.isPending) return null;
  const application = props.application;
  const activeUnavailable = Boolean(activePath && activeQuery.data && activeConcept === null);
  const discoveryUnavailable = Boolean(entriesQuery.error || entriesQuery.data?.truncated);

  const writeConcept = async (
    concept: CrokiConceptFile,
    expectedContents: string | null,
  ): Promise<boolean> => {
    const relativePath = crokiConceptRelativePath(concept.concept.id);
    const contents = serializeCrokiConceptFile(concept);
    const expectedContentsSha256 =
      expectedContents === null ? null : await sha256Hex(expectedContents);
    const result = await writeProjectFile({
      environmentId: props.environmentId,
      input: {
        cwd: props.workspaceRoot,
        relativePath,
        contents,
        expectedContentsSha256,
      },
    });
    if (result._tag === "Success") {
      setProjectFileQueryData(props.environmentId, props.workspaceRoot, relativePath, contents);
      confirmProjectFileQueryData(props.environmentId, props.workspaceRoot, relativePath, contents);
      entriesQuery.refresh();
      return true;
    }
    if (!isAtomCommandInterrupted(result)) {
      const failure = squashAtomCommandFailure(result);
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "Concept was not changed",
          description:
            failure instanceof Error
              ? failure.message
              : "This concept changed elsewhere. Review it and try again.",
        }),
      );
    }
    return false;
  };

  const createConcept = () => {
    const normalizedName = name.trim();
    const normalizedIntent = intent.trim();
    if (!normalizedName || !normalizedIntent || discoveryUnavailable) return;
    const existingIds = conceptIdsFromEntries(entriesQuery.data?.entries ?? []);
    const concept = createCrokiConcept(application, normalizedName, normalizedIntent, existingIds);
    const branch = concept.scope.branch;
    setSaving(true);
    void (async () => {
      const written = await writeConcept(concept, null);
      if (!written) {
        setSaving(false);
        return;
      }
      setDialogOpen(false);
      setName("");
      setIntent("");
      try {
        await props.onStartConcept(branch);
        toastManager.add({
          type: "success",
          title: `${concept.concept.name} is exploring separately`,
          description: "Its worktree inherits application reality without changing it.",
        });
      } catch (error) {
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: "Concept created, but its Thread did not open",
            description: error instanceof Error ? error.message : "Open a new worktree Thread.",
          }),
        );
      } finally {
        setSaving(false);
      }
    })();
  };

  const updateStatus = (status: CrokiConceptStatus) => {
    if (!activeConcept || !activeQuery.data) return;
    const currentContents = activeQuery.data.contents;
    setSaving(true);
    void (async () => {
      const written = await writeConcept(
        { ...activeConcept, concept: { ...activeConcept.concept, status } },
        currentContents,
      );
      setSaving(false);
      if (written) {
        toastManager.add({
          type: "success",
          title: status === "archived" ? "Concept archived" : "Integration review requested",
          description:
            status === "archived"
              ? "It no longer enters ordinary provider perception."
              : "Code and application truth remain separate approvals.",
        });
      }
    })();
  };

  return (
    <>
      {activeConcept ? (
        <ActiveConceptIndicator concept={activeConcept} saving={saving} onStatus={updateStatus} />
      ) : activeId ? (
        <span className="px-1.5 text-xs text-amber-500">
          {activeUnavailable ? "Concept invalid" : "Concept unavailable"}
        </span>
      ) : (
        <Button
          size="xs"
          variant="ghost"
          disabled={discoveryUnavailable || entriesQuery.isPending}
          onClick={() => setDialogOpen(true)}
        >
          Explore separately
        </Button>
      )}
      <CreateConceptDialog
        open={dialogOpen}
        name={name}
        intent={intent}
        saving={saving}
        onOpenChange={setDialogOpen}
        onNameChange={setName}
        onIntentChange={setIntent}
        onCreate={createConcept}
      />
    </>
  );
}

function parseConceptData(contents: string | undefined): CrokiConceptFile | null {
  if (contents === undefined) return null;
  try {
    return parseCrokiConceptFile(contents);
  } catch {
    return null;
  }
}

async function sha256Hex(contents: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(contents));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
