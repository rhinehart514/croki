import {
  CROKI_RELEASE_LIMITS,
  CROKI_RELEASE_STATUSES,
  type CrokiReleaseCandidate,
  type CrokiReleaseStatus,
} from "@croki/shared/crokiReleaseCandidate";
import { useState } from "react";

import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";

export interface CrokiReleaseDetailsInput {
  readonly version: string;
  readonly baseline: string;
  readonly goal: string;
  readonly status: CrokiReleaseStatus;
}

export function CrokiReleaseDetailsForm(props: {
  readonly release?: CrokiReleaseCandidate;
  readonly onCancel?: () => void;
  readonly onSubmit: (input: CrokiReleaseDetailsInput) => void;
}) {
  const [version, setVersion] = useState(props.release?.version ?? "");
  const [baseline, setBaseline] = useState(props.release?.baseline ?? "");
  const [goal, setGoal] = useState(props.release?.goal ?? "");
  const [status, setStatus] = useState<CrokiReleaseStatus>(props.release?.status ?? "active");
  const valid = Boolean(version.trim() && baseline.trim() && goal.trim());

  return (
    <form
      className="mx-auto w-full max-w-xl space-y-5"
      aria-label={props.release ? "Edit release candidate" : "Start release candidate"}
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid) return;
        props.onSubmit({ version, baseline, goal, status });
      }}
    >
      <div>
        <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500">
          {props.release ? "Release identity" : "Introduce Canvas"}
        </p>
        <h2 className="mt-2 text-xl font-semibold text-white">
          {props.release ? "Edit the candidate" : "Name the next release"}
        </h2>
        <p className="mt-2 max-w-lg text-xs leading-5 text-zinc-500">
          Canvas makes active scope and missing proof visible beside the Thread. Work still happens
          through Croki’s native tools.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1">
          <span className="text-[10px] uppercase tracking-[0.1em] text-zinc-500">Next release</span>
          <Input
            className="border-white/15 bg-black"
            maxLength={CROKI_RELEASE_LIMITS.versionChars}
            placeholder="0.4.2"
            value={version}
            onChange={(event) => setVersion(event.target.value)}
          />
        </label>
        <label className="space-y-1">
          <span className="text-[10px] uppercase tracking-[0.1em] text-zinc-500">Baseline</span>
          <Input
            className="border-white/15 bg-black"
            maxLength={CROKI_RELEASE_LIMITS.versionChars}
            placeholder="0.4.1"
            value={baseline}
            onChange={(event) => setBaseline(event.target.value)}
          />
        </label>
      </div>

      <label className="block space-y-1">
        <span className="text-[10px] uppercase tracking-[0.1em] text-zinc-500">Release goal</span>
        <Textarea
          className="min-h-28 resize-y border-white/15 bg-black text-sm leading-6"
          maxLength={CROKI_RELEASE_LIMITS.goalChars}
          placeholder="What becomes true when this version ships?"
          value={goal}
          onChange={(event) => setGoal(event.target.value)}
        />
      </label>

      {props.release ? (
        <label className="block space-y-1">
          <span className="text-[10px] uppercase tracking-[0.1em] text-zinc-500">
            Release state
          </span>
          <select
            aria-label="Release state"
            className="h-9 w-full border border-white/15 bg-black px-2 text-xs text-zinc-300"
            value={status}
            onChange={(event) => setStatus(event.target.value as CrokiReleaseStatus)}
          >
            {CROKI_RELEASE_STATUSES.map((candidate) => (
              <option key={candidate} value={candidate}>
                {candidate}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <div className="flex justify-end gap-2 border-t border-white/10 pt-4">
        {props.onCancel ? (
          <Button type="button" variant="ghost" onClick={props.onCancel}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" disabled={!valid}>
          {props.release ? "Apply" : "Start release"}
        </Button>
      </div>
    </form>
  );
}
