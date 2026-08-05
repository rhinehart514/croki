import {
  CROKI_CONCEPT_LIMITS,
  type CrokiConceptFile,
  type CrokiConceptStatus,
} from "@croki/shared/crokiConcepts";

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
import { Input } from "../ui/input";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { Textarea } from "../ui/textarea";

export function CreateConceptDialog(props: {
  readonly open: boolean;
  readonly name: string;
  readonly intent: string;
  readonly saving: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onNameChange: (name: string) => void;
  readonly onIntentChange: (intent: string) => void;
  readonly onCreate: () => void;
}) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogPopup className="max-w-lg">
        <CreateConceptDialogContents {...props} />
      </DialogPopup>
    </Dialog>
  );
}

export function CreateConceptDialogContents(
  props: Omit<Parameters<typeof CreateConceptDialog>[0], "open">,
) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>Explore a concept separately</DialogTitle>
        <DialogDescription>
          Croki will open an isolated worktree Thread. Application truth stays unchanged.
        </DialogDescription>
      </DialogHeader>
      <DialogPanel className="grid gap-4">
        <label htmlFor="croki-concept-name" className="grid gap-1.5 text-sm">
          <span className="font-medium text-foreground">Concept</span>
          <Input
            id="croki-concept-name"
            autoFocus
            maxLength={CROKI_CONCEPT_LIMITS.nameChars}
            value={props.name}
            onChange={(event) => props.onNameChange(event.currentTarget.value)}
            placeholder="Application Sense"
          />
        </label>
        <label htmlFor="croki-concept-intent" className="grid gap-1.5 text-sm">
          <span className="font-medium text-foreground">What should become true?</span>
          <Textarea
            id="croki-concept-intent"
            maxLength={CROKI_CONCEPT_LIMITS.intentChars}
            value={props.intent}
            onChange={(event) => props.onIntentChange(event.currentTarget.value)}
            placeholder="Parallel product work stays coherent without slowing exploration."
          />
        </label>
      </DialogPanel>
      <DialogFooter>
        <Button variant="outline" disabled={props.saving} onClick={() => props.onOpenChange(false)}>
          Cancel
        </Button>
        <Button
          disabled={props.saving || !props.name.trim() || !props.intent.trim()}
          onClick={props.onCreate}
        >
          {props.saving ? "Creating concept…" : "Explore separately"}
        </Button>
      </DialogFooter>
    </>
  );
}

export function ActiveConceptIndicator(props: {
  readonly concept: CrokiConceptFile;
  readonly saving: boolean;
  readonly onStatus: (status: CrokiConceptStatus) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            className="flex h-8 min-w-0 max-w-56 items-center gap-1 px-1.5 text-xs text-foreground hover:text-foreground"
          />
        }
      >
        <span aria-hidden className="text-muted-foreground/40">
          /
        </span>
        <span className="truncate">{props.concept.concept.name}</span>
      </PopoverTrigger>
      <PopoverPopup align="start" side="bottom" className="w-96 p-0" viewportClassName="p-3">
        <ActiveConceptDetails {...props} />
      </PopoverPopup>
    </Popover>
  );
}

export function ActiveConceptDetails(props: Parameters<typeof ActiveConceptIndicator>[0]) {
  return (
    <div className="grid gap-4 text-xs">
      <div>
        <p className="font-medium text-foreground">{props.concept.concept.name}</p>
        <p className="mt-0.5 text-muted-foreground">
          {conceptStatusLabel(props.concept.concept.status)}
        </p>
      </div>
      <p className="leading-4 text-foreground">{props.concept.concept.intent}</p>
      <dl className="grid grid-cols-[4.5rem_1fr] gap-x-3 gap-y-1 text-muted-foreground">
        <dt>Branch</dt>
        <dd className="truncate text-foreground">{props.concept.scope.branch}</dd>
        {props.concept.parent.releasedVersion ? (
          <>
            <dt>Released</dt>
            <dd className="text-foreground tabular-nums">{props.concept.parent.releasedVersion}</dd>
          </>
        ) : null}
        {props.concept.parent.buildingVersion ? (
          <>
            <dt>Building</dt>
            <dd className="text-foreground tabular-nums">{props.concept.parent.buildingVersion}</dd>
          </>
        ) : null}
      </dl>
      {props.concept.concept.status !== "archived" ? (
        <div className="flex gap-2 border-t border-border/70 pt-3">
          {props.concept.concept.status === "exploring" ? (
            <Button
              size="sm"
              variant="outline"
              disabled={props.saving}
              onClick={() => props.onStatus("integration-proposed")}
            >
              Review integration
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            disabled={props.saving}
            onClick={() => props.onStatus("archived")}
          >
            Archive concept
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function conceptStatusLabel(status: CrokiConceptStatus): string {
  if (status === "exploring") return "Exploring separately · Parent context active";
  if (status === "integration-proposed") return "Integration review requested";
  return "Archived · Excluded from ordinary perception";
}
