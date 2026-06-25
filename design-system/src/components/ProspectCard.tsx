import * as React from "react";
import { cn } from "../lib/cn";
import { Badge } from "./Badge";

export interface ProspectCardProps extends React.ComponentProps<"div"> {
  name: React.ReactNode;
  /** The ICP-fit score, shown as a badge (e.g. "92"). */
  score?: React.ReactNode;
  scoreTone?: "proven" | "gap" | "danger" | "neutral";
  summary?: React.ReactNode;
  /** A drafted outreach message — renders the inset draft panel when present. */
  draft?: React.ReactNode;
  draftLabel?: React.ReactNode;
  /** A trailing action in the draft header (e.g. a copy button). */
  draftAction?: React.ReactNode;
  /** A leading glyph next to the account name. */
  icon?: React.ReactNode;
}

/** An enriched account: name, ICP-fit score, summary, and an optional draft. */
export function ProspectCard({
  name,
  score,
  scoreTone = "proven",
  summary,
  draft,
  draftLabel = "Draft",
  draftAction,
  icon,
  className,
  ...props
}: ProspectCardProps) {
  return (
    <div className={cn("gtm-prospect", className)} {...props}>
      <div className="gtm-prospect__header">
        <span className="gtm-prospect__name">
          {icon}
          {name}
        </span>
        {score != null ? (
          <Badge tone={scoreTone} className="gtm-prospect__score">
            {score}
          </Badge>
        ) : null}
      </div>
      {summary != null ? <p className="gtm-prospect__summary">{summary}</p> : null}
      {draft != null ? (
        <div className="gtm-prospect__draft">
          <div className="gtm-prospect__draft-header">
            <span>{draftLabel}</span>
            {draftAction}
          </div>
          <p className="gtm-prospect__draft-body">{draft}</p>
        </div>
      ) : null}
    </div>
  );
}
