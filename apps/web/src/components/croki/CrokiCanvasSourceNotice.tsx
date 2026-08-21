import { AlertTriangle, FilePlus2, RefreshCw, Wrench } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "../ui/button";
import type { CrokiCanvasDraftSnapshot } from "./crokiCanvasDraftStore";

interface CrokiCanvasSourceNoticeProps {
  readonly onCancelRepair: () => void;
  readonly onConfirmRepair: () => void;
  readonly onReloadConflict: () => void;
  readonly onRequestRepair: () => void;
  readonly onRetry: () => void;
  readonly state: CrokiCanvasDraftSnapshot;
}

export function CrokiCanvasSourceNotice(props: CrokiCanvasSourceNoticeProps) {
  if (props.state.conflictContents !== null) {
    return (
      <Notice icon={<AlertTriangle className="size-4" aria-hidden />} role="alert">
        <p className="text-xs font-medium">Canvas changed in the workspace</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Your draft is preserved. Reload the workspace copy to discard it.
        </p>
        <Button className="mt-2" size="sm" variant="outline" onClick={props.onReloadConflict}>
          Reload workspace copy
        </Button>
      </Notice>
    );
  }

  if (props.state.sourceState === "partial") {
    return (
      <Notice icon={<Wrench className="size-4" aria-hidden />} role="alert">
        <p className="text-xs font-medium">
          {props.state.repairInProgress ? "Recovered Canvas ready" : "Canvas partially recovered"}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {props.state.repairInProgress
            ? "Save to replace the exact source with the valid recovered items."
            : props.state.sourceMessage}
        </p>
        {props.state.repairInProgress ? null : props.state.repairConfirmation ? (
          <div className="mt-2 flex items-center gap-2">
            <p className="min-w-0 flex-1 text-xs">
              Remove invalid entries and preserve the recovered items?
            </p>
            <Button size="sm" variant="ghost" onClick={props.onCancelRepair}>
              Cancel
            </Button>
            <Button size="sm" onClick={props.onConfirmRepair}>
              Use recovered copy
            </Button>
          </div>
        ) : (
          <Button className="mt-2" size="sm" variant="outline" onClick={props.onRequestRepair}>
            Review recovered copy
          </Button>
        )}
      </Notice>
    );
  }

  if (props.state.sourceState === "malformed") {
    return (
      <Notice icon={<Wrench className="size-4" aria-hidden />} role="alert">
        <p className="text-xs font-medium">
          {props.state.repairInProgress ? "Repair ready" : "Canvas needs repair"}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {props.state.repairInProgress
            ? "Save to replace the exact invalid workspace copy."
            : props.state.sourceMessage}
        </p>
        {props.state.repairInProgress ? null : props.state.repairConfirmation ? (
          <div className="mt-2 flex items-center gap-2">
            <p className="min-w-0 flex-1 text-xs">Replace the invalid file with an empty Canvas?</p>
            <Button size="sm" variant="ghost" onClick={props.onCancelRepair}>
              Cancel
            </Button>
            <Button size="sm" variant="destructive" onClick={props.onConfirmRepair}>
              Repair
            </Button>
          </div>
        ) : (
          <Button className="mt-2" size="sm" variant="outline" onClick={props.onRequestRepair}>
            Repair Canvas
          </Button>
        )}
      </Notice>
    );
  }

  if (props.state.sourceState === "read-error") {
    return (
      <Notice icon={<AlertTriangle className="size-4" aria-hidden />} role="alert">
        <p className="text-xs font-medium">
          {props.state.repairInProgress ? "New Canvas ready" : "Canvas is unavailable"}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {props.state.repairInProgress
            ? "Save will create the file only if it is absent."
            : props.state.sourceMessage}
        </p>
        {props.state.repairInProgress ? null : props.state.repairConfirmation &&
          !props.state.dirty ? (
          <div className="mt-2 flex items-center gap-2">
            <p className="min-w-0 flex-1 text-xs">Create a Canvas only if the file is absent?</p>
            <Button size="sm" variant="ghost" onClick={props.onCancelRepair}>
              Cancel
            </Button>
            <Button size="sm" onClick={props.onConfirmRepair}>
              Create
            </Button>
          </div>
        ) : (
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="outline" onClick={props.onRetry}>
              <RefreshCw className="size-3.5" aria-hidden />
              Retry
            </Button>
            {!props.state.dirty ? (
              <Button size="sm" variant="ghost" onClick={props.onRequestRepair}>
                <FilePlus2 className="size-3.5" aria-hidden />
                Create if missing
              </Button>
            ) : null}
          </div>
        )}
      </Notice>
    );
  }

  if (props.state.sourceState === "missing") {
    return (
      <Notice icon={<FilePlus2 className="size-4" aria-hidden />}>
        <p className="text-xs font-medium">No Canvas file yet</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Add a suggestion, then save to create .croki/context.json.
        </p>
      </Notice>
    );
  }

  return null;
}

function Notice(props: {
  readonly children: ReactNode;
  readonly icon: ReactNode;
  readonly role?: "alert" | "status";
}) {
  return (
    <div
      role={props.role ?? "status"}
      className="flex gap-2 border-y border-border/70 bg-black px-3 py-2"
    >
      <span className="mt-0.5 text-muted-foreground">{props.icon}</span>
      <div className="min-w-0 flex-1">{props.children}</div>
    </div>
  );
}
