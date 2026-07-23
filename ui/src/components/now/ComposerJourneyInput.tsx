import { useRef, type ChangeEvent } from "react";
import { FileChartColumnIncreasing, X } from "lucide-react";

export type StagedJourneyAttachment = {
  importRef: string;
  name: string;
  byteSize: number;
  rowCount?: number;
};

export function ComposerJourneyInput({ attachment, disabled, staging, onChoose, onRemove }: {
  attachment: StagedJourneyAttachment | null;
  disabled: boolean;
  staging: boolean;
  onChoose: (file: File) => void;
  onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const change = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) onChoose(file);
    event.target.value = "";
  };
  return <>
    <input
      ref={inputRef}
      className="now-composer-journey-input"
      type="file"
      accept=".csv,.json,.jsonl,text/csv,application/json,application/x-ndjson"
      onChange={change}
      tabIndex={-1}
    />
    {attachment ? (
      <div className="now-composer-journey" aria-label={`Observed journey source ${attachment.name}`}>
        <FileChartColumnIncreasing aria-hidden="true" />
        <span><strong>{attachment.name}</strong><small>{attachment.rowCount ? `${attachment.rowCount.toLocaleString()} rows · ` : ""}Ready to map in this Thread</small></span>
        <button type="button" aria-label={`Remove ${attachment.name}`} onClick={onRemove} disabled={disabled}><X aria-hidden="true" /></button>
      </div>
    ) : (
      <button
        type="button"
        className="now-icon-btn"
        aria-label={staging ? "Reading observed journey file" : "Add observed journey data"}
        title="Add CSV, JSON, or JSONL journey data"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || staging}
      >
        <FileChartColumnIncreasing aria-hidden="true" />
      </button>
    )}
  </>;
}
