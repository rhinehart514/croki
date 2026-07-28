import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useSpeechInput } from "./useSpeechInput";

type Result = ArrayLike<{ transcript: string }> & { isFinal: boolean };

class FakeRecognition {
  static current: FakeRecognition | null = null;
  lang = "";
  continuous = false;
  interimResults = false;
  maxAlternatives = 0;
  start = vi.fn();
  stop = vi.fn();
  abort = vi.fn();
  onresult: ((event: { results: ArrayLike<Result> }) => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((event: { error?: string }) => void) | null = null;

  constructor() {
    FakeRecognition.current = this;
  }
}

function result(transcript: string, isFinal: boolean): Result {
  return Object.assign([{ transcript }], { isFinal });
}

function installRecognition() {
  (window as unknown as Record<string, unknown>).webkitSpeechRecognition = FakeRecognition;
}

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
  FakeRecognition.current = null;
});

describe("useSpeechInput", () => {
  it("streams interim and final words as one continuous composer transcript", () => {
    installRecognition();
    const onTranscript = vi.fn();
    const { result: hook } = renderHook(() => useSpeechInput(onTranscript));

    act(() => hook.current.start());
    const recognition = FakeRecognition.current!;
    expect(hook.current.recording).toBe(true);
    expect(recognition.continuous).toBe(true);
    expect(recognition.interimResults).toBe(true);
    expect(recognition.lang).toBe(navigator.language);

    act(() => recognition.onresult?.({ results: [result("Map the", true), result("product walk", false)] }));
    expect(onTranscript).toHaveBeenLastCalledWith("Map the product walk");

    act(() => recognition.onresult?.({ results: [result("Map the", true), result("product walk clearly", true)] }));
    expect(onTranscript).toHaveBeenLastCalledWith("Map the product walk clearly");
    expect(onTranscript).toHaveBeenCalledTimes(2);

    act(() => hook.current.stop());
    expect(recognition.stop).toHaveBeenCalledOnce();
    expect(hook.current.recording).toBe(false);
  });

  it("keeps recognition failures visible and recoverable", () => {
    installRecognition();
    const { result: hook } = renderHook(() => useSpeechInput(() => undefined));

    act(() => hook.current.start());
    act(() => FakeRecognition.current?.onerror?.({ error: "not-allowed" }));

    expect(hook.current.recording).toBe(false);
    expect(hook.current.issue).toMatch(/Microphone access is off/);
    act(() => hook.current.clearIssue());
    expect(hook.current.issue).toBeNull();
  });

  it("omits voice cleanly where recognition is unavailable", () => {
    const { result: hook } = renderHook(() => useSpeechInput(() => undefined));
    expect(hook.current.supported).toBe(false);
    act(() => hook.current.start());
    expect(hook.current.recording).toBe(false);
  });
});
