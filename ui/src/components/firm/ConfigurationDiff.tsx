import { useState } from "react";
import { ArrowRight } from "lucide-react";
import type { FirmConfigurationDiffEntry } from "@/types";

const CONSEQUENCES = [
  { match: /(^|\.)authority(\.|$)/, label: "What must still wait for your hand changes" },
  { match: /(^|\.)(capabilities|activation)(\.|$)/, label: "What a participant can do or when they join changes" },
  { match: /(^|\.)(runtime|model)(\.|$)/, label: "Which runtime carries the work changes" },
  { match: /(^|\.)(budget|maxsteps|dailyspendusd)(\.|$)/, label: "The work or spend boundary changes" },
  { match: /(^|\.)(coordination|protocols|relationships)(\.|$)/, label: "How participants work together changes" },
  { match: /(^|\.)(context|memory|evaluation)(\.|$)/, label: "What informs participant judgment changes" },
  { match: /(^|\.)(presentation|participantlabel|collectivelabel)(\.|$)/, label: "How the firm names its participants changes" },
  { match: /(^|\.)organization(\.|$)/, label: "How the firm relates participants changes" },
] as const;

function pathLabel(path: string) {
  return path
    .split(".")
    .map((part, index) => {
      if (index === 0 && part === "agents") return "participants";
      return part.replace(/([a-z])([A-Z])/g, "$1 $2");
    })
    .join(" › ");
}

function exactValue(value: unknown) {
  if (value == null || value === "") return "Not set";
  if (Array.isArray(value)) return value.length ? value.map(String).join(", ") : "None";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function visibleValue(value: unknown) {
  const exact = exactValue(value);
  return exact.length > 88 ? `${exact.slice(0, 85)}…` : exact;
}

function consequenceSummary(entries: FirmConfigurationDiffEntry[]) {
  const labels = new Set<string>();
  let unmatched = false;
  for (const entry of entries) {
    const path = entry.path.toLowerCase();
    const consequence = CONSEQUENCES.find(({ match }) => match.test(path));
    if (consequence) labels.add(consequence.label);
    else unmatched = true;
  }
  if (unmatched) labels.add("The firm definition changes");
  return [...labels];
}

export function ConfigurationDiff({ entries }: { entries: FirmConfigurationDiffEntry[] }) {
  const [open, setOpen] = useState(false);
  if (!entries.length) return null;
  return (
    <div className="firm-app-configuration-change">
      <section className="firm-app-configuration-summary" aria-label="What this changes">
        <strong>What this changes</strong>
        <ul>{consequenceSummary(entries).map((label) => <li key={label}>{label}</li>)}</ul>
      </section>
      <details
        className="firm-app-configuration-diff"
        open={open}
        onToggle={(event) => setOpen(event.currentTarget.open)}
      >
        <summary>Inspect {entries.length} exact {entries.length === 1 ? "change" : "changes"}</summary>
        <ul>
          {entries.map((entry) => (
            <li key={entry.path}>
              <strong>{pathLabel(entry.path)}</strong>
              <span>
                <del title={exactValue(entry.before)}>{visibleValue(entry.before)}</del>
                <ArrowRight aria-hidden="true" />
                <ins title={exactValue(entry.after)}>{visibleValue(entry.after)}</ins>
              </span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
