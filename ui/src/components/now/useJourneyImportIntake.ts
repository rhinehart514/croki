import { useState, type RefObject } from "react";
import { deleteJourneyImport, stageJourneyImport } from "@/api";
import type { StagedJourneyAttachment } from "./ComposerJourneyInput";
import { prepareJourneyFile } from "./composerJourneyFile";

export function useJourneyImportIntake({
  ventureId, enabled, readOnly, busy, attachment, setAttachment, textareaRef, onIssue,
}: {
  ventureId: string;
  enabled: boolean;
  readOnly: boolean;
  busy: boolean;
  attachment: StagedJourneyAttachment | null;
  setAttachment: (value: StagedJourneyAttachment | null) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onIssue: (issue: string | null) => void;
}) {
  const [staging, setStaging] = useState(false);

  const choose = async (file: File) => {
    if (!enabled || readOnly || busy || staging) return;
    setStaging(true);
    onIssue(null);
    try {
      const prepared = await prepareJourneyFile(file);
      const response = await stageJourneyImport(ventureId, prepared);
      setAttachment({
        importRef: response.import.importRef,
        name: response.import.name,
        byteSize: response.import.byteSize,
        rowCount: response.import.rowCount,
      });
      textareaRef.current?.focus();
    } catch (cause) {
      onIssue(cause instanceof Error ? cause.message : "Croki could not read that journey source.");
    } finally {
      setStaging(false);
    }
  };

  const remove = () => {
    setAttachment(null);
    if (!attachment) return;
    void deleteJourneyImport(ventureId, attachment.importRef).catch((cause) => {
      onIssue(cause instanceof Error ? cause.message : "Croki could not remove that journey source. It will be cleaned up automatically.");
    });
  };

  return { staging, choose, remove };
}
