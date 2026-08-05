import { Button } from "../ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import {
  buildApplicationLineage,
  type ApplicationLineageDraft,
  type ApplicationManifestEvidence,
} from "./CrokiApplicationSetup.logic";

export function CrokiApplicationSetupDialog(props: {
  readonly open: boolean;
  readonly discovering: boolean;
  readonly discoveryFailed: boolean;
  readonly saving: boolean;
  readonly draft: ApplicationLineageDraft;
  readonly evidence: ApplicationManifestEvidence | null;
  readonly projectThreadCount: number;
  readonly workspaceRoot: string;
  readonly onOpenChange: (open: boolean) => void;
  readonly onExplore: () => void;
  readonly onSave: () => void;
}) {
  const inputsDisabled = props.discovering || props.saving;
  const canConfirm = buildApplicationLineage(props.draft) !== null;
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogPopup className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Review application direction</DialogTitle>
          <DialogDescription>
            Croki prepared a project-wide proposal. Confirm it once and every Thread will receive
            the same direction.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="grid gap-5">
          <ManifestEvidence
            discovering={props.discovering}
            discoveryFailed={props.discoveryFailed}
            evidence={props.evidence}
            projectThreadCount={props.projectThreadCount}
            workspaceRoot={props.workspaceRoot}
          />
          <ApplicationDirectionProposal draft={props.draft} />
          <p className="border-t border-border/72 pt-4 text-xs leading-4 text-muted-foreground">
            Confirmation creates <code>.croki/application.croki</code> in the project root. It does
            not release, tag, publish, or change provider behavior.
          </p>
        </DialogPanel>
        <DialogFooter>
          <Button
            variant="outline"
            disabled={props.saving}
            onClick={() => props.onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button variant="outline" disabled={inputsDisabled} onClick={props.onExplore}>
            Explore in Thread
          </Button>
          <Button
            disabled={inputsDisabled || !canConfirm}
            title={canConfirm ? undefined : "Explore in Thread to establish the missing direction."}
            onClick={props.onSave}
          >
            {props.saving ? "Confirming direction…" : "Confirm direction"}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

function ApplicationDirectionProposal(props: { readonly draft: ApplicationLineageDraft }) {
  return (
    <div className="grid gap-4 text-sm">
      <div>
        <p className="font-medium text-foreground">
          {props.draft.name || "Application name needed"}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">Proposed project direction</p>
      </div>
      {props.draft.releasedVersion ? (
        <section aria-labelledby="application-proposal-released" className="grid gap-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <h3 id="application-proposal-released" className="font-medium text-foreground">
              Released
            </h3>
            <span className="tabular-nums text-muted-foreground">
              {props.draft.releasedVersion}
            </span>
          </div>
          <p className="text-xs leading-4 text-muted-foreground">{props.draft.releasedSummary}</p>
        </section>
      ) : null}
      {props.draft.buildingVersion || props.draft.buildingIntent ? (
        <section
          aria-labelledby="application-proposal-building"
          className="grid gap-1.5 border-t border-border/72 pt-4"
        >
          <div className="flex items-baseline justify-between gap-3">
            <h3 id="application-proposal-building" className="font-medium text-foreground">
              Building
            </h3>
            <span className="tabular-nums text-muted-foreground">
              {props.draft.buildingVersion || "Version needed"}
            </span>
          </div>
          <p className="text-xs leading-4 text-foreground">
            {props.draft.buildingIntent || "Direction needs founder input."}
          </p>
        </section>
      ) : (
        <p className="text-xs leading-4 text-amber-500">
          Croki could not establish a version proposal from project evidence. Explore it in this
          Thread before confirming.
        </p>
      )}
    </div>
  );
}

function ManifestEvidence(props: {
  readonly discovering: boolean;
  readonly discoveryFailed: boolean;
  readonly evidence: ApplicationManifestEvidence | null;
  readonly projectThreadCount: number;
  readonly workspaceRoot: string;
}) {
  if (props.discovering) {
    return <p className="text-xs text-muted-foreground">Checking root manifests…</p>;
  }
  if (!props.evidence) {
    return (
      <p className="text-xs leading-4 text-muted-foreground">
        {props.discoveryFailed
          ? "Some root manifests could not be checked. Review the proposed values before setting application direction."
          : props.projectThreadCount > 0
            ? `No root manifest supplied an application name or version. Croki used the project folder and ${props.projectThreadCount} project Thread${props.projectThreadCount === 1 ? "" : "s"} as a starting point.`
            : "No root manifest supplied an application name or version. Croki used the project folder as a starting point."}
      </p>
    );
  }
  const found = [props.evidence.name, props.evidence.version].filter(Boolean).join(" · ");
  return (
    <div className="grid gap-2">
      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <span className="text-muted-foreground">Found in {props.evidence.path}</span>
        <span className="truncate text-foreground tabular-nums">{found}</span>
        <span className="text-muted-foreground">Project</span>
        <span className="truncate text-foreground">{workspaceLabel(props.workspaceRoot)}</span>
      </div>
      {props.projectThreadCount > 0 ? (
        <p className="text-xs leading-4 text-muted-foreground">
          Building intent also reflects {props.projectThreadCount} recent project Thread
          {props.projectThreadCount === 1 ? "" : "s"}.
        </p>
      ) : null}
      {props.discoveryFailed ? (
        <p className="text-xs leading-4 text-amber-500">
          Some other root manifests could not be checked. Review the proposed values before setting
          application direction.
        </p>
      ) : null}
    </div>
  );
}

function workspaceLabel(root: string): string {
  const normalized = root.replaceAll("\\", "/").replace(/\/+$/, "");
  return normalized.slice(normalized.lastIndexOf("/") + 1) || root;
}
