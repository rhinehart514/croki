import { type EnvironmentId, type ThreadId } from "@croki/contracts";
import { MicIcon, SquareIcon } from "lucide-react";
import { memo } from "react";

import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { useCodexVoice } from "./useCodexVoice";

export const CodexVoiceButton = memo(function CodexVoiceButton(props: {
  environmentId: EnvironmentId;
  threadId: ThreadId;
  onError: (message: string | null) => void;
}) {
  const voice = useCodexVoice(props);
  const active = voice.state === "connecting" || voice.state === "listening";
  const label = active
    ? voice.state === "connecting"
      ? "Cancel connecting to Codex voice"
      : "End Codex voice"
    : voice.state === "stopping"
      ? "Ending Codex voice"
      : voice.state === "error"
        ? "Retry Codex voice"
        : "Start Codex voice";

  return (
    <div className="flex items-center gap-1.5">
      <span className="sr-only" aria-live="polite">
        {voice.state === "connecting"
          ? "Connecting to Codex voice"
          : voice.state === "listening"
            ? "Codex voice is listening"
            : voice.state === "stopping"
              ? "Ending Codex voice"
              : ""}
      </span>
      {active || voice.state === "stopping" ? (
        <span className="text-muted-foreground text-xs" aria-hidden="true">
          {voice.state === "connecting"
            ? "Connecting…"
            : voice.state === "stopping"
              ? "Ending…"
              : "Listening"}
        </span>
      ) : null}
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className={
                active
                  ? "text-red-400 hover:text-red-300"
                  : "text-muted-foreground hover:text-foreground"
              }
              aria-label={label}
              aria-pressed={active}
              disabled={voice.state === "stopping"}
              onClick={() => void (active ? voice.stop() : voice.start())}
            />
          }
        >
          {active ? <SquareIcon className="size-3.5" /> : <MicIcon className="size-4" />}
        </TooltipTrigger>
        <TooltipPopup side="top">{label}</TooltipPopup>
      </Tooltip>
    </div>
  );
});
