import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@croki/client-runtime/state/runtime";
import type { EnvironmentId } from "@croki/contracts";
import { CROKI_APPLICATION_RELATIVE_PATH } from "@croki/shared/crokiApplication";
import type { CrokiApplicationProgress } from "@croki/shared/crokiApplicationProgress";
import { useEffect, useMemo, useState } from "react";

import {
  confirmProjectFileQueryData,
  setProjectFileQueryData,
  useProjectEntriesQuery,
  useProjectFileQuery,
} from "~/components/files/projectFilesQueryState";
import { projectEnvironment } from "~/state/projects";
import { useAtomCommand } from "~/state/use-atom-command";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { CrokiApplicationIndicator } from "./CrokiApplicationPresentation";
import type { CrokiApplicationState } from "./CrokiApplicationPresentation.logic";
import { CrokiApplicationSetupDialog } from "./CrokiApplicationSetupDialog";
import {
  buildApplicationLineage,
  discoverApplicationManifest,
  initialApplicationLineageDraft,
  serializeApplicationLineage,
  type ApplicationLineageDraft,
} from "./CrokiApplicationSetup.logic";

const EMPTY_DRAFT: ApplicationLineageDraft = {
  name: "",
  releasedVersion: "",
  releasedSummary: "",
  buildingVersion: "",
  buildingIntent: "",
};

export function CrokiApplicationControl(props: {
  readonly environmentId: EnvironmentId;
  readonly state: CrokiApplicationState;
  readonly progress: CrokiApplicationProgress | null;
  readonly workspaceRoot: string;
  readonly projectThreadTitles?: readonly string[];
  readonly onExploreInThread: () => void;
  readonly onInspectSource: (relativePath: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const shouldDiscover = open && props.state.status === "absent";
  const rootEntries = useProjectEntriesQuery(props.environmentId, props.workspaceRoot);
  const rootPaths = new Set(rootEntries.data?.entries.map((entry) => entry.path) ?? []);
  const readPackageJson = shouldDiscover && rootPaths.has("package.json");
  const readPyprojectToml = shouldDiscover && rootPaths.has("pyproject.toml");
  const readCargoToml = shouldDiscover && rootPaths.has("Cargo.toml");
  const packageJson = useProjectFileQuery(
    props.environmentId,
    props.workspaceRoot,
    "package.json",
    readPackageJson,
  );
  const pyprojectToml = useProjectFileQuery(
    props.environmentId,
    props.workspaceRoot,
    "pyproject.toml",
    readPyprojectToml,
  );
  const cargoToml = useProjectFileQuery(
    props.environmentId,
    props.workspaceRoot,
    "Cargo.toml",
    readCargoToml,
  );
  const writeProjectFile = useAtomCommand(projectEnvironment.writeFile, { reportFailure: false });
  const discovering =
    shouldDiscover &&
    (rootEntries.isPending ||
      (readPackageJson && packageJson.isPending) ||
      (readPyprojectToml && pyprojectToml.isPending) ||
      (readCargoToml && cargoToml.isPending));
  const discoveryFailed =
    shouldDiscover &&
    (Boolean(rootEntries.error) ||
      Boolean(rootEntries.data?.truncated) ||
      (readPackageJson && Boolean(packageJson.error)) ||
      (readPyprojectToml && Boolean(pyprojectToml.error)) ||
      (readCargoToml && Boolean(cargoToml.error)));
  const evidence = useMemo(
    () =>
      discoverApplicationManifest({
        packageJson: packageJson.data?.contents,
        pyprojectToml: pyprojectToml.data?.contents,
        cargoToml: cargoToml.data?.contents,
      }),
    [cargoToml.data?.contents, packageJson.data?.contents, pyprojectToml.data?.contents],
  );

  useEffect(() => {
    if (!open || initialized || discovering) return;
    setDraft(
      initialApplicationLineageDraft(
        workspaceLabel(props.workspaceRoot),
        evidence,
        props.projectThreadTitles,
      ),
    );
    setInitialized(true);
  }, [discovering, evidence, initialized, open, props.projectThreadTitles, props.workspaceRoot]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (saving) return;
    setOpen(nextOpen);
    if (!nextOpen) {
      setDraft(EMPTY_DRAFT);
      setInitialized(false);
    }
  };

  const save = () => {
    const application = buildApplicationLineage(draft);
    if (!application) return;

    const contents = serializeApplicationLineage(application);
    setSaving(true);
    void (async () => {
      const result = await writeProjectFile({
        environmentId: props.environmentId,
        input: {
          cwd: props.workspaceRoot,
          relativePath: CROKI_APPLICATION_RELATIVE_PATH,
          contents,
          expectedContentsSha256: null,
        },
      });
      setSaving(false);
      if (result._tag === "Success") {
        setProjectFileQueryData(
          props.environmentId,
          props.workspaceRoot,
          CROKI_APPLICATION_RELATIVE_PATH,
          contents,
        );
        confirmProjectFileQueryData(
          props.environmentId,
          props.workspaceRoot,
          CROKI_APPLICATION_RELATIVE_PATH,
          contents,
        );
        handleOpenChange(false);
        toastManager.add({
          type: "success",
          title: "Application direction set",
          description: `${application.application.name} now carries into every new turn.`,
        });
        return;
      }
      if (!isAtomCommandInterrupted(result)) {
        const failure = squashAtomCommandFailure(result);
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: "Could not set application direction",
            description:
              failure instanceof Error
                ? failure.message
                : "The draft is preserved. Check the project and try again.",
          }),
        );
      }
    })();
  };

  const exploreInThread = () => {
    handleOpenChange(false);
    props.onExploreInThread();
  };
  const applicationSourcePath = props.state.status === "loaded" ? props.state.sourcePath : null;

  return (
    <>
      <CrokiApplicationIndicator
        state={props.state}
        progress={props.progress}
        onSetup={props.state.status === "absent" ? () => setOpen(true) : undefined}
        onExplore={props.state.status === "loaded" ? exploreInThread : undefined}
        onInspectSource={
          applicationSourcePath ? () => props.onInspectSource(applicationSourcePath) : undefined
        }
      />
      <CrokiApplicationSetupDialog
        open={open}
        discovering={discovering}
        discoveryFailed={discoveryFailed}
        saving={saving}
        draft={draft}
        evidence={evidence}
        projectThreadCount={props.projectThreadTitles?.length ?? 0}
        workspaceRoot={props.workspaceRoot}
        onOpenChange={handleOpenChange}
        onExplore={exploreInThread}
        onSave={save}
      />
    </>
  );
}

function workspaceLabel(root: string): string {
  const normalized = root.replaceAll("\\", "/").replace(/\/+$/, "");
  return normalized.slice(normalized.lastIndexOf("/") + 1) || root;
}
