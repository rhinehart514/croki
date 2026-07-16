import { Bot, ChevronDown } from "lucide-react";
import type { FirmRuntimeStatus } from "@/api";

export type RuntimeChoice = "auto" | FirmRuntimeStatus["id"];

export function RuntimePicker({
  runtimes,
  value,
  onChange,
  disabled = false,
}: {
  runtimes: FirmRuntimeStatus[];
  value: RuntimeChoice;
  onChange: (runtime: RuntimeChoice) => void;
  disabled?: boolean;
}) {
  const connected = runtimes.filter((runtime) => runtime.connected);
  const selected = value === "auto" ? null : runtimes.find((runtime) => runtime.id === value);
  const detail = selected
    ? selected.connected ? selected.authLabel ?? "Connected" : selected.reason ?? "Unavailable"
    : connected.length ? `Auto · ${connected.length} available` : "No runtime connected";

  return (
    <label className="firm-app-runtime-picker" title={detail}>
      <Bot aria-hidden="true" />
      <span className="sr-only">Runtime</span>
      <select
        aria-label="Runtime"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as RuntimeChoice)}
      >
        <option value="auto">Auto</option>
        {runtimes.map((runtime) => (
          <option key={runtime.id} value={runtime.id} disabled={!runtime.connected}>
            {runtime.label}{runtime.connected ? "" : " — unavailable"}
          </option>
        ))}
      </select>
      <ChevronDown aria-hidden="true" />
    </label>
  );
}
