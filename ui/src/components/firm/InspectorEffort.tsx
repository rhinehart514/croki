// The inspector's effort view — the most common swap target. When an effort is selected on the stage,
// this renders it whole (composite §9): what the effort is for, who's on it (faces), and its draft as
// the draft's ACTUAL content — a numbered plan or the prepared text — with the staged-… identifier
// demoted to a disclosure at the bottom (the exact inversion of the audit's "ID as title" failure).
// The closing green note restates the trust contract at the moment of reading.

import { useState } from "react";
import { CrewFace } from "@/components/crew/CrewFace";
import type { FirmBet, FirmStagedArtifact } from "@/types";

function draftLines(artifact: FirmStagedArtifact): string[] {
  const content = typeof artifact.content === "string" ? artifact.content : "";
  return content
    .split(/\n+/)
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .filter(Boolean);
}

export function InspectorEffort({
  bet,
  stateLabel,
  crewNameByRef,
}: {
  bet: FirmBet;
  stateLabel: string;
  crewNameByRef: Map<string, string>;
}) {
  const [idsOpen, setIdsOpen] = useState(false);
  const draft = bet.staged[0] ?? null;
  const lines = draft ? draftLines(draft) : [];
  const ownerRef = bet.teammateRef ?? draft?.ownerRefs?.[0] ?? null;
  const ownerName = ownerRef ? crewNameByRef.get(ownerRef) ?? ownerRef : null;

  return (
    <>
      <span className="insp-state"><span className="sdot" aria-hidden="true" />{stateLabel}</span>

      <div className="insp-block">
        <p className="insp-label">What this effort is for</p>
        <p className="insp-para">{bet.intent}</p>
      </div>

      {ownerRef ? (
        <div className="insp-block">
          <p className="insp-label">Who's on it</p>
          <div className="insp-crew-row">
            <CrewFace agentRef={ownerRef} size={34} className="insp-crew-face" />
            <div>
              <div className="insp-crew-name">{ownerName}</div>
              <div className="insp-crew-role">on this effort with you</div>
            </div>
          </div>
        </div>
      ) : null}

      {draft ? (
        <div className="insp-block">
          <p className="insp-label">Its draft</p>
          <div className="insp-draft">
            <div className="id-head">
              <span className="id-ic" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 16 16"><rect x="2" y="1.5" width="9" height="13" rx="1.6" fill="none" stroke="currentColor" strokeWidth="1.2" /><path d="M4.5 5h5M4.5 8h5M4.5 11h3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" /></svg>
              </span>
              <div>
                <div className="id-kick">Draft · not yet acted on</div>
                <div className="id-name">{draft.title?.trim() || "Prepared work"}</div>
              </div>
            </div>
            {lines.length > 1 ? (
              <ul className="id-list">
                {lines.slice(0, 6).map((line, index) => (
                  <li key={index}><span className="num">{index + 1}</span>{line}</li>
                ))}
              </ul>
            ) : lines.length === 1 ? (
              <p className="id-lede">{lines[0]}</p>
            ) : (
              <p className="id-lede">This draft is prepared and waiting for your read.</p>
            )}
          </div>
          <button type="button" className="insp-disclosure" aria-expanded={idsOpen} onClick={() => setIdsOpen((open) => !open)}>
            {idsOpen ? "▾" : "▸"} {draft.id ?? "draft"}{draft.configurationRevision != null ? ` · firm v${draft.configurationRevision}` : ""}
          </button>
        </div>
      ) : null}

      <div className="insp-note">
        <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 8l3 3 5.5-6" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <span>This is a draft in your venture. Read it and say what you think — nothing here touches the world until you say so.</span>
      </div>

      <button
        type="button"
        className="insp-inspect-work"
        onClick={() => window.dispatchEvent(new CustomEvent("drover:dive-effort", { detail: { betId: bet.id } }))}
      >
        Inspect this work — the full run record
      </button>
    </>
  );
}
