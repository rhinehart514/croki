import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { useEffect, useRef } from "react";

import { playCompletionSound, primeCompletionSound } from "../completionSound";
import { useThreadShells } from "../state/entities";
import {
  completionSoundSnapshot,
  type CompletionSoundSnapshot,
  shouldPlayCompletionSound,
} from "./CompletionSoundCoordinator.logic";

export function CompletionSoundCoordinator() {
  const threads = useThreadShells();
  const previousByThreadRef = useRef<ReadonlyMap<string, CompletionSoundSnapshot> | null>(null);

  useEffect(() => {
    const prime = () => primeCompletionSound();
    window.addEventListener("pointerdown", prime, { once: true });
    window.addEventListener("keydown", prime, { once: true });
    return () => {
      window.removeEventListener("pointerdown", prime);
      window.removeEventListener("keydown", prime);
    };
  }, []);

  useEffect(() => {
    const previousByThread = previousByThreadRef.current;
    const nextByThread = new Map<string, CompletionSoundSnapshot>();
    let completed = false;

    for (const thread of threads) {
      const threadKey = scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id));
      const snapshot = completionSoundSnapshot(thread);
      nextByThread.set(threadKey, snapshot);
      completed ||= shouldPlayCompletionSound(previousByThread?.get(threadKey), snapshot);
    }

    previousByThreadRef.current = nextByThread;
    if (completed) playCompletionSound();
  }, [threads]);

  return null;
}
