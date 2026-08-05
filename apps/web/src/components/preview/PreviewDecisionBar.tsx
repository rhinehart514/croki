import { GitMerge, RotateCcw, SquareCheckBig } from "lucide-react";
import { useState } from "react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";

export type PreviewExplorationState =
  | "idle"
  | "building"
  | "options-working"
  | "options-ready"
  | "applying";

interface Props {
  state: PreviewExplorationState;
  onKeep: () => void;
  onCombine: (direction: string) => void;
  onDiscard: () => void;
  onStop?: (() => void) | undefined;
  optionLabel?: string | undefined;
}

export function PreviewDecisionBar({
  state,
  onKeep,
  onCombine,
  onDiscard,
  onStop,
  optionLabel,
}: Props) {
  const [combining, setCombining] = useState(false);
  const [direction, setDirection] = useState("");

  if (state === "idle") return null;

  if (state === "building" || state === "options-working" || state === "applying") {
    return (
      <div
        className="absolute inset-x-3 bottom-3 z-20 flex items-center justify-between gap-3 border border-border bg-background px-3 py-2 shadow-lg"
        role="status"
      >
        <div>
          <p className="text-sm font-medium text-foreground">
            {state === "building"
              ? "Building the working preview…"
              : state === "applying"
                ? "Applying the Preview decision…"
                : "Creating live alternatives…"}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            The result will open here when it is ready.
          </p>
        </div>
        {onStop ? (
          <Button type="button" variant="outline" size="sm" onClick={onStop}>
            Stop
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="absolute inset-x-3 bottom-3 z-20 border border-border bg-background p-3 shadow-lg">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">
            Choose {optionLabel ?? "this option"}?
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Switch Preview tabs to compare. The active tab is the option these actions use.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button type="button" variant="ghost" size="sm" onClick={onDiscard}>
            <RotateCcw />
            Discard
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setCombining((value) => !value)}
          >
            <GitMerge />
            Combine
          </Button>
          <Button type="button" size="sm" onClick={onKeep}>
            <SquareCheckBig />
            Keep
          </Button>
        </div>
      </div>
      {combining ? (
        <form
          className="mt-3 flex gap-2 border-t border-border pt-3"
          onSubmit={(event) => {
            event.preventDefault();
            onCombine(direction.trim());
          }}
        >
          <label htmlFor="preview-combine-direction" className="sr-only">
            What should the combined option preserve?
          </label>
          <Input
            id="preview-combine-direction"
            value={direction}
            onChange={(event) => setDirection(event.target.value)}
            placeholder="Keep the original navigation, use this option's interaction"
            autoFocus
          />
          <Button type="submit" size="sm">
            Apply combination
          </Button>
        </form>
      ) : null}
    </div>
  );
}
