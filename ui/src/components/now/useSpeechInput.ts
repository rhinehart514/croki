// Voice is an input method for the existing composer, never a second conversation surface. Chromium's
// speech recognizer provides the live words; the caller owns the durable draft so a Thread/mode change
// cannot strand a separate voice buffer. Unsupported browsers simply omit the affordance.
import { useCallback, useEffect, useRef, useState } from "react";

type SpeechRecognitionResultLike = ArrayLike<{ transcript: string }> & { isFinal: boolean };
type SpeechRecognitionEventLike = { results: ArrayLike<SpeechRecognitionResultLike> };
type SpeechRecognitionErrorLike = { error?: string; message?: string };

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort?: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorLike) => void) | null;
};

function recognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const speechWindow = window as unknown as Record<string, unknown>;
  return (speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null) as (new () => SpeechRecognitionLike) | null;
}

function recognitionIssue(error?: string) {
  switch (error) {
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone access is off. Allow it for Croki, then try again.";
    case "audio-capture":
      return "Croki could not find a working microphone.";
    case "network":
      return "Voice recognition is unavailable right now. Your draft is still here.";
    case "language-not-supported":
      return "Voice recognition does not support this language.";
    case "no-speech":
      return "No speech was heard. Tap the microphone to try again.";
    case "aborted":
      return null;
    default:
      return "Voice recognition stopped unexpectedly. Your draft is still here.";
  }
}

export function useSpeechInput(onTranscript: (text: string) => void) {
  const [recording, setRecording] = useState(false);
  const [issue, setIssue] = useState<string | null>(null);
  const [supported] = useState(() => recognitionCtor() !== null);
  const activeRef = useRef<SpeechRecognitionLike | null>(null);
  const callbackRef = useRef(onTranscript);
  useEffect(() => { callbackRef.current = onTranscript; }, [onTranscript]);

  const stop = useCallback(() => {
    const recognition = activeRef.current;
    if (!recognition) return;
    // Update immediately so editing/sending never races a delayed browser `onend`.
    activeRef.current = null;
    setRecording(false);
    recognition.stop();
  }, []);

  const start = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor || activeRef.current) return;
    const recognition = new Ctor();
    recognition.lang = typeof navigator !== "undefined" && navigator.language ? navigator.language : "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      // `stop()` may still be followed by a queued result. Once typing or sending has taken control,
      // that late browser event must not rewrite the durable draft.
      if (activeRef.current !== recognition) return;
      const parts: string[] = [];
      for (let index = 0; index < event.results.length; index += 1) {
        const text = event.results[index][0]?.transcript?.trim();
        if (text) parts.push(text);
      }
      callbackRef.current(parts.join(" "));
    };
    recognition.onend = () => {
      if (activeRef.current === recognition) activeRef.current = null;
      setRecording(false);
    };
    recognition.onerror = (event) => {
      if (activeRef.current !== recognition && event.error === "aborted") return;
      if (activeRef.current === recognition) activeRef.current = null;
      setRecording(false);
      const nextIssue = recognitionIssue(event.error);
      if (nextIssue) setIssue(nextIssue);
    };
    activeRef.current = recognition;
    setIssue(null);
    try {
      recognition.start();
      setRecording(true);
    } catch {
      activeRef.current = null;
      setRecording(false);
      setIssue("Voice recognition could not start. Your draft is still here.");
    }
  }, []);

  const toggle = useCallback(() => {
    if (activeRef.current) stop();
    else start();
  }, [start, stop]);

  const clearIssue = useCallback(() => setIssue(null), []);

  useEffect(() => () => {
    const recognition = activeRef.current;
    activeRef.current = null;
    recognition?.abort?.();
    if (!recognition?.abort) recognition?.stop();
  }, []);

  return { supported, recording, issue, start, stop, toggle, clearIssue };
}
