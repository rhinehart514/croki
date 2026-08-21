let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;

  audioContext ??= new AudioContext({ latencyHint: "interactive" });
  return audioContext;
}

/** Prime browser audio from a user gesture so a later turn completion can make sound. */
export function primeCompletionSound(): void {
  const context = getAudioContext();
  if (context?.state === "suspended") {
    void context.resume().catch(() => undefined);
  }
}

/** Play a short, low-cost bell tone without loading or continuously running audio. */
export function playCompletionSound(): void {
  const context = getAudioContext();
  if (!context) return;

  const play = () => {
    const now = context.currentTime;
    const masterGain = context.createGain();
    masterGain.gain.setValueAtTime(0.0001, now);
    masterGain.gain.exponentialRampToValueAtTime(0.16, now + 0.012);
    masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
    masterGain.connect(context.destination);

    for (const [frequency, volume] of [
      [1046.5, 1],
      [2093, 0.22],
    ] as const) {
      const oscillator = context.createOscillator();
      const partialGain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, now);
      partialGain.gain.setValueAtTime(volume, now);
      oscillator.connect(partialGain);
      partialGain.connect(masterGain);
      oscillator.start(now);
      oscillator.stop(now + 0.44);
    }
  };

  if (context.state === "suspended") {
    void context
      .resume()
      .then(play)
      .catch(() => undefined);
    return;
  }

  play();
}
