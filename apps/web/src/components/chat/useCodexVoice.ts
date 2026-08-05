import { useAtomValue } from "@effect/atom-react";
import {
  type CodexVoiceError,
  type CodexVoiceEvent,
  type EnvironmentId,
  type ThreadId,
} from "@croki/contracts";
import * as Cause from "effect/Cause";
import { AsyncResult, Atom } from "effect/unstable/reactivity";
import { useCallback, useEffect, useRef, useState } from "react";

import { codexVoice } from "../../state/codexVoice";
import { useAtomCommand } from "../../state/use-atom-command";

type VoiceState = "idle" | "connecting" | "listening" | "stopping" | "error";

const dormantVoiceEventAtom = Atom.make(
  AsyncResult.initial<CodexVoiceEvent, CodexVoiceError>(false),
);

export function useCodexVoice(input: {
  environmentId: EnvironmentId;
  threadId: ThreadId;
  onError: (message: string | null) => void;
}) {
  const { environmentId, threadId, onError } = input;
  const [state, setState] = useState<VoiceState>("idle");
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const ownerRef = useRef<{ environmentId: EnvironmentId; threadId: ThreadId } | null>(null);
  const attemptRef = useRef(0);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const startVoice = useAtomCommand(codexVoice.start, { reportFailure: false });
  const stopVoice = useAtomCommand(codexVoice.stop, { reportFailure: false });
  const voiceEvent = useAtomValue(
    state === "connecting" || state === "listening"
      ? codexVoice.eventsAtom({ environmentId, input: { threadId } })
      : dormantVoiceEventAtom,
  );

  const releaseBrowserAudio = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    peerRef.current?.close();
    peerRef.current = null;
  }, []);

  const stopOwnedSession = useCallback(async () => {
    const owner = ownerRef.current;
    releaseBrowserAudio();
    if (!owner) return;
    const result = await stopVoice({
      environmentId: owner.environmentId,
      input: { threadId: owner.threadId },
    });
    if (result._tag === "Success" && ownerRef.current === owner) ownerRef.current = null;
    return result;
  }, [releaseBrowserAudio, stopVoice]);

  const fail = useCallback(
    (message: string) => {
      attemptRef.current += 1;
      onErrorRef.current(`${message} You can keep typing normally.`);
      setState("error");
      void stopOwnedSession();
    },
    [stopOwnedSession],
  );

  const stop = useCallback(async () => {
    attemptRef.current += 1;
    setState("stopping");
    const result = await stopOwnedSession();
    if (result?._tag === "Failure") {
      fail("Your microphone is off, but Codex did not confirm the voice session ended.");
      return;
    }
    setState("idle");
  }, [fail, stopOwnedSession]);

  useEffect(() => {
    if (AsyncResult.isFailure(voiceEvent)) {
      const cause = Cause.squash(voiceEvent.cause);
      fail(cause instanceof Error ? cause.message : "Codex voice is unavailable.");
      return;
    }
    if (!AsyncResult.isSuccess(voiceEvent)) return;
    const event = voiceEvent.value;
    const peer = peerRef.current;
    if (event.type === "sdp" && peer) {
      void peer
        .setRemoteDescription({ type: "answer", sdp: event.sdp })
        .catch(() => fail("Codex returned an invalid voice connection."));
    } else if (event.type === "error") {
      fail(event.message);
    } else if (event.type === "closed") {
      releaseBrowserAudio();
      ownerRef.current = null;
      if (event.reason) onErrorRef.current(`Voice ended: ${event.reason}`);
      setState("idle");
    }
  }, [fail, releaseBrowserAudio, voiceEvent]);

  const start = useCallback(async () => {
    if (state !== "idle" && state !== "error") return;
    const attempt = ++attemptRef.current;
    const isCurrentAttempt = () => attemptRef.current === attempt;
    onErrorRef.current(null);
    setState("connecting");
    try {
      if (ownerRef.current) {
        const priorStop = await stopOwnedSession();
        if (!isCurrentAttempt()) return;
        if (priorStop?._tag === "Failure") {
          throw new Error("The previous Codex voice session did not end.");
        }
      }
      const media = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      if (!isCurrentAttempt()) {
        media.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = media;
      const peer = new RTCPeerConnection();
      peerRef.current = peer;
      ownerRef.current = { environmentId, threadId };
      peer.addTrack(media.getAudioTracks()[0]!, media);
      peer.createDataChannel("oai-events");

      const audio = document.createElement("audio");
      audio.autoplay = true;
      peer.ontrack = (event) => {
        audio.srcObject = event.streams[0] ?? null;
      };
      peer.onconnectionstatechange = () => {
        if (peer.connectionState === "connected") {
          onErrorRef.current(null);
          setState("listening");
        }
        if (peer.connectionState === "failed" || peer.connectionState === "disconnected") {
          fail("Voice connection ended.");
        }
      };

      const offer = await peer.createOffer();
      if (!isCurrentAttempt()) return;
      await peer.setLocalDescription(offer);
      if (!isCurrentAttempt()) return;
      if (!offer.sdp) throw new Error("The browser did not create a voice connection offer.");

      const result = await startVoice({
        environmentId,
        input: { threadId, sdp: offer.sdp },
      });
      if (!isCurrentAttempt()) {
        await stopVoice({ environmentId, input: { threadId } });
        return;
      }
      if (result._tag === "Failure") throw Cause.squash(result.cause);
    } catch (cause) {
      if (!isCurrentAttempt()) return;
      const message = cause instanceof Error ? cause.message : "Codex voice could not start.";
      fail(message);
    }
  }, [environmentId, fail, startVoice, state, stopOwnedSession, stopVoice, threadId]);

  useEffect(() => {
    const owner = ownerRef.current;
    if (owner && (owner.environmentId !== environmentId || owner.threadId !== threadId)) {
      attemptRef.current += 1;
      void stopOwnedSession();
      setState("idle");
    }
  }, [environmentId, stopOwnedSession, threadId]);

  useEffect(
    () => () => {
      attemptRef.current += 1;
      void stopOwnedSession();
    },
    [stopOwnedSession],
  );

  return { state, start, stop } as const;
}
