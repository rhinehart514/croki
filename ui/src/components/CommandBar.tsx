import { useEffect, useRef, useState } from "react";
import { ArrowUp, LoaderCircle } from "lucide-react";
const SUGGESTIONS = [
  "Inspect this product and work the biggest GTM problem",
  "Shape this channel from its outcome backward",
  "Debug the current loop until it reaches my review gate",
  "Compare my channels and find the highest-leverage next move",
];

export function CommandBar({
  disabled,
  onSubmit,
}: {
  disabled?: boolean;
  onSubmit?: (cmd: string) => void | Promise<void>;
}) {
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageError, setMessageError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const messageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear any pending timer on unmount
  useEffect(() => {
    return () => {
      if (messageTimerRef.current) clearTimeout(messageTimerRef.current);
    };
  }, []);

  const showMessage = (text: string, isError: boolean) => {
    if (messageTimerRef.current) clearTimeout(messageTimerRef.current);
    setMessage(text);
    setMessageError(isError);
    messageTimerRef.current = setTimeout(() => {
      setMessage(null);
      setMessageError(false);
    }, 3000);
  };

  const submit = async () => {
    const trimmed = value.trim();
    if (!trimmed || disabled || loading) return;
    setValue("");

    setLoading(true);
    try {
      await onSubmit?.(trimmed);
      showMessage("Operator session started.", false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not start the operator.";
      showMessage(msg, true);
    } finally {
      setLoading(false);
    }
  };

  const isDisabled = disabled || loading;

  return (
    <div className="cmd-bar-wrap">
      <div className="cmd-bar">
        <span className="cmd-bar-k">⌘K</span>
        <input
          ref={inputRef}
          className="cmd-bar-input"
          disabled={isDisabled}
          placeholder="Give the GTM operator a goal…"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
            if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              inputRef.current?.focus();
            }
          }}
          type="text"
        />
        <button
          className={`cmd-bar-send ${value.trim() && !isDisabled ? "active" : ""}`}
          disabled={!value.trim() || isDisabled}
          onClick={() => void submit()}
          type="button"
        >
          {loading ? <LoaderCircle className="spin" style={{ width: 14, height: 14 }} /> : <ArrowUp />}
        </button>
      </div>
      {message && (
        <div
          className={`cmd-bar-message ${messageError ? "cmd-bar-message-error" : ""}`}
          role={messageError ? "alert" : "status"}
        >
          {message}
        </div>
      )}
      <div className="cmd-bar-chips">
        {SUGGESTIONS.map((s) => (
          <button
            className="cmd-bar-chip"
            disabled={isDisabled}
            key={s}
            onClick={() => { setValue(s); inputRef.current?.focus(); }}
            type="button"
          >
            {s}
          </button>
        ))}
        <button className="cmd-bar-chip cmd-bar-chip-more" disabled={isDisabled} type="button">
          ›
        </button>
      </div>
    </div>
  );
}
