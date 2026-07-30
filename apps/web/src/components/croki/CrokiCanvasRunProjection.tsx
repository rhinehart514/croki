import { Check, Circle, CircleDot, ListTodo } from "lucide-react";

import type { ActivePlanState } from "~/session-logic";
import { Button } from "../ui/button";

interface CrokiCanvasRunProjectionProps {
  readonly activePlan: ActivePlanState | null;
  readonly onPrepareWorkflow?: () => void;
}

export function CrokiCanvasRunProjection(props: CrokiCanvasRunProjectionProps) {
  return (
    <section aria-label="Current Thread workflow" className="border-y border-border/60 py-3">
      <div className="flex items-start gap-2">
        <ListTodo className="mt-0.5 size-4 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1">
          <h3 className="text-xs font-semibold tracking-wide uppercase">Current Thread run</h3>
          {props.activePlan ? (
            <>
              {props.activePlan.explanation ? (
                <p className="mt-1 text-xs text-muted-foreground">{props.activePlan.explanation}</p>
              ) : null}
              <ol className="mt-2 divide-y divide-border/50">
                {props.activePlan.steps.map((step, index) => (
                  <li key={`${index}:${step.step}`} className="flex gap-2 py-2 text-xs">
                    <PlanStatusIcon status={step.status} />
                    <span
                      className={
                        step.status === "completed" ? "text-muted-foreground" : "text-foreground"
                      }
                    >
                      {step.step}
                    </span>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">
              No active plan in this Thread. Workflow work still runs as ordinary Croki turns.
            </p>
          )}
          {props.onPrepareWorkflow ? (
            <Button className="mt-2" size="sm" variant="outline" onClick={props.onPrepareWorkflow}>
              Compose in Thread
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function PlanStatusIcon(props: { readonly status: ActivePlanState["steps"][number]["status"] }) {
  if (props.status === "completed") {
    return <Check className="mt-0.5 size-3.5 shrink-0" aria-label="Completed" />;
  }
  if (props.status === "inProgress") {
    return <CircleDot className="mt-0.5 size-3.5 shrink-0" aria-label="In progress" />;
  }
  return <Circle className="mt-0.5 size-3.5 shrink-0" aria-label="Pending" />;
}
