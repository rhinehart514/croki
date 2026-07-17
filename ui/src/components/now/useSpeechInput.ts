// Voice as an equal input mode. Uses the browser SpeechRecognition where present (Chrome/Electron), and
// reports `supported: false` everywhere else so the composer simply omits the mic — no broken affordance.
// Final transcripts are handed back to the caller; the hook holds no draft state of its own. Refs are
// only ever touched inside callbacks/effects (never during render) to satisfy the hooks lint rules.
import { useCallback, useEffect, useRef, useState } from "react";

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

function recognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as (new () => SpeechRecognitionLike) | null;
}

export function useSpeechInput(onTranscript: (text: string) => void) {
  const [recording, setRecording] = useState(false);
  const [supported] = useState(() => recognitionCtor() !== null);
  const activeRef = useRef<SpeechRecognitionLike | null>(null);
  const callbackRef = useRef(onTranscript);
  useEffect(() => { callbackRef.current = onTranscript; }, [onTranscript]);

  const stop = useCallback(() => { activeRef.current?.stop(); }, []);

  const start = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor || activeRef.current) return;
    const recognition = new Ctor();
    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      for (let i = 0; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result.isFinal) {
          const text = result[0]?.transcript?.trim();
          if (text) callbackRef.current(text);
        }
      }
    };
    const finish = () => { activeRef.current = null; setRecording(false); };
    recognition.onend = finish;
    recognition.onerror = finish;
    activeRef.current = recognition;
    setRecording(true);
    recognition.start();
  }, []);

  const toggle = useCallback(() => {
    if (activeRef.current) stop();
    else start();
  }, [start, stop]);

  useEffect(() => () => { activeRef.current?.stop(); }, []);

  return { supported, recording, toggle };
}
