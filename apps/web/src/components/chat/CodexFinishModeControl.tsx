import type { CodexGoal, CodexGoalSnapshot, EnvironmentId, ThreadId } from "@croki/contracts";
import type { AtomCommandResult } from "@croki/client-runtime/state/runtime";
import * as Cause from "effect/Cause";
import { PauseIcon, PlayIcon, TargetIcon, XIcon } from "lucide-react";
import { memo, useCallback, useEffect, useState } from "react";

import { codexGoal } from "../../state/codexGoal";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";

function failureMessage(result: { readonly cause: Cause.Cause<unknown> }): string {
  const cause = Cause.squash(result.cause);
  return cause instanceof Error ? cause.message : "Finish mode could not be updated.";
}

export function codexGoalUsageLabel(goal: CodexGoal): string {
  const minutes = Math.floor(goal.timeUsedSeconds / 60);
  const tokens = goal.tokensUsed.toLocaleString();
  return `${minutes}m · ${tokens} tokens`;
}

export function codexGoalStatusLabel(status: CodexGoal["status"]): string {
  switch (status) {
    case "active":
      return "Finishing";
    case "complete":
      return "Complete";
    case "paused":
      return "Paused";
    case "blocked":
      return "Blocked";
    case "usageLimited":
      return "Usage limit";
    case "budgetLimited":
      return "Budget reached";
  }
}

export const CodexFinishModeControl = memo(function CodexFinishModeControl(props: {
  environmentId: EnvironmentId;
  threadId: ThreadId;
}) {
  const getGoal = useAtomCommand(codexGoal.get, { reportFailure: false });
  const setGoal = useAtomCommand(codexGoal.set, { reportFailure: false });
  const setStatus = useAtomCommand(codexGoal.setStatus, { reportFailure: false });
  const clearGoal = useAtomCommand(codexGoal.clear, { reportFailure: false });
  const [goal, setCurrentGoal] = useState<CodexGoal | null>(null);
  const [objective, setObjective] = useState("");
  const [budget, setBudget] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async <E,>(operation: Promise<AtomCommandResult<CodexGoalSnapshot, E>>) => {
      setBusy(true);
      setError(null);
      const result = await operation;
      setBusy(false);
      if (result._tag === "Failure") {
        setError(failureMessage(result));
        return null;
      }
      const snapshot = result.value;
      setCurrentGoal(snapshot.goal);
      return snapshot.goal;
    },
    [],
  );

  useEffect(() => {
    let active = true;
    void getGoal({ environmentId: props.environmentId, input: { threadId: props.threadId } }).then(
      (result) => {
        if (!active || result._tag !== "Success") return;
        setCurrentGoal(result.value.goal);
      },
    );
    return () => {
      active = false;
    };
  }, [getGoal, props.environmentId, props.threadId]);

  useEffect(() => {
    if (!goal || (goal.status !== "active" && goal.status !== "paused")) return;
    const interval = window.setInterval(() => {
      void getGoal({
        environmentId: props.environmentId,
        input: { threadId: props.threadId },
      }).then((result) => {
        if (result._tag === "Success") setCurrentGoal(result.value.goal);
      });
    }, 5_000);
    return () => window.clearInterval(interval);
  }, [getGoal, goal, props.environmentId, props.threadId]);

  const start = async () => {
    const trimmed = objective.trim();
    if (!trimmed) return;
    const parsedBudget = budget.trim() ? Number.parseInt(budget, 10) : undefined;
    const next = await run(
      setGoal({
        environmentId: props.environmentId,
        input: {
          threadId: props.threadId,
          objective: trimmed,
          ...(parsedBudget !== undefined && parsedBudget > 0 ? { tokenBudget: parsedBudget } : {}),
        },
      }),
    );
    if (next) {
      setObjective("");
      setBudget("");
    }
  };

  const statusLabel = goal ? codexGoalStatusLabel(goal.status) : "Finish mode";

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            size="xs"
            variant="ghost"
            className="gap-1.5 text-muted-foreground hover:text-foreground"
            aria-label={goal ? `${statusLabel}: ${goal.objective}` : "Start Finish mode"}
          />
        }
      >
        <TargetIcon className="size-3.5" />
        <span className="hidden @4xl/header-actions:inline">{statusLabel}</span>
      </PopoverTrigger>
      <PopoverPopup side="bottom" align="end" className="w-80" viewportClassName="p-3">
        {goal ? (
          <div className="space-y-3">
            <div>
              <div className="text-xs font-medium text-foreground">{statusLabel}</div>
              <p className="mt-1 text-sm leading-5 text-foreground">{goal.objective}</p>
              <p className="mt-1 text-xs text-muted-foreground">{codexGoalUsageLabel(goal)}</p>
            </div>
            <div className="flex items-center gap-2">
              {goal.status === "active" ? (
                <Button
                  size="xs"
                  variant="secondary"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      setStatus({
                        environmentId: props.environmentId,
                        input: { threadId: props.threadId, status: "paused" },
                      }),
                    )
                  }
                >
                  <PauseIcon className="size-3.5" /> Pause
                </Button>
              ) : goal.status === "paused" || goal.status === "blocked" ? (
                <Button
                  size="xs"
                  variant="secondary"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      setStatus({
                        environmentId: props.environmentId,
                        input: { threadId: props.threadId, status: "active" },
                      }),
                    )
                  }
                >
                  <PlayIcon className="size-3.5" /> Resume
                </Button>
              ) : null}
              <Button
                size="xs"
                variant="ghost"
                disabled={busy}
                onClick={() =>
                  void run(
                    clearGoal({
                      environmentId: props.environmentId,
                      input: { threadId: props.threadId },
                    }),
                  )
                }
              >
                <XIcon className="size-3.5" /> Clear
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <div className="text-sm font-medium text-foreground">Run to an outcome</div>
              <p className="mt-1 text-xs leading-4 text-muted-foreground">
                Codex continues across turns until this objective completes or needs you.
              </p>
            </div>
            <textarea
              value={objective}
              onChange={(event) => setObjective(event.target.value)}
              placeholder="Keep going until the review bots are green"
              rows={3}
              className="w-full resize-none rounded-md border border-border bg-background px-2.5 py-2 text-sm text-foreground outline-none focus:border-ring"
            />
            <label className="block text-xs text-muted-foreground">
              Token budget <span className="text-muted-foreground/60">(optional)</span>
              <input
                value={budget}
                onChange={(event) => setBudget(event.target.value.replace(/\D/g, ""))}
                inputMode="numeric"
                placeholder="No limit"
                className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-ring"
              />
            </label>
            <Button size="sm" disabled={busy || !objective.trim()} onClick={() => void start()}>
              Start Finish mode
            </Button>
          </div>
        )}
        {error ? <p className="mt-2 text-xs text-red-400">{error}</p> : null}
      </PopoverPopup>
    </Popover>
  );
});
