import { AnimatePresence } from "motion/react";
import type { MutableRefObject } from "react";
import type { FirmVenture, VisualReference, WorkIndex } from "@/api";
import { FirmSettings } from "@/components/firm/FirmSettings";
import type { ArtifactSectionFocus } from "@/components/review/artifactSectionFocus";
import { VisualStage } from "@/components/visual-stage/VisualStage";
import type { FirmLens } from "@/types";
import type { directionsFromWorkIndex } from "./workIndexModel";

export function WorkspaceOverlays({
  venture, stage, timeline, workIndex, directions, lens, readOnly, readOnlyReason,
  artifactFocus, settingsConnection, openerRef, onArtifactFocus, onContextualChatOpen,
  onStage, onOpenThread, onChanged, onSettingsConnection, onCapabilitiesChanged,
}: {
  venture: FirmVenture;
  stage: VisualReference | null;
  timeline: import("@/api").ThreadTimeline | null;
  workIndex: WorkIndex | null;
  directions: ReturnType<typeof directionsFromWorkIndex>;
  lens: FirmLens | null;
  readOnly: boolean;
  readOnlyReason: string;
  artifactFocus: ArtifactSectionFocus | null;
  settingsConnection: "gmail" | null | undefined;
  openerRef: MutableRefObject<HTMLElement | null>;
  onArtifactFocus: (focus: ArtifactSectionFocus | null) => void;
  onContextualChatOpen: (open: boolean) => void;
  onStage: (stage: VisualReference | null) => void;
  onOpenThread: (ref: string) => void;
  onChanged: () => void;
  onSettingsConnection: (connection: "gmail" | null | undefined) => void;
  onCapabilitiesChanged: () => void;
}) {
  return <>
    <AnimatePresence initial={false}>
      {stage ? (
        <VisualStage
          key={`${stage.kind}:${stage.ref}`}
          visual={stage}
          timeline={timeline}
          workIndex={workIndex}
          directions={directions}
          lens={lens}
          readOnlyReason={readOnly ? readOnlyReason : null}
          artifactFocus={artifactFocus}
          onArtifactFocus={(focus) => { onArtifactFocus(focus); onContextualChatOpen(true); }}
          onClose={() => { onStage(null); onArtifactFocus(null); openerRef.current?.focus(); }}
          onOpenThread={onOpenThread}
          onChanged={onChanged}
        />
      ) : null}
    </AnimatePresence>
    {settingsConnection !== undefined ? (
      <FirmSettings
        key={settingsConnection ?? "settings"}
        venture={venture}
        readOnly={readOnly}
        readOnlyReason={readOnlyReason}
        initialConnection={settingsConnection}
        onCapabilitiesChanged={onCapabilitiesChanged}
        onClose={() => onSettingsConnection(undefined)}
      />
    ) : null}
  </>;
}
