import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import type { FirmVenture } from "@/api";
import { VentureCreateForm } from "./VentureCreateForm";

export function VentureCreateDialog({
  ventures,
  onCreated,
  onClose,
}: {
  ventures: FirmVenture[];
  onCreated: (venture: FirmVenture) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    dialogRef.current?.querySelector<HTMLInputElement>("input")?.focus();
  }, []);

  return (
    <div className="venture-create-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div
        ref={dialogRef}
        className="venture-create-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="venture-create-title"
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }}
      >
        <header>
          <div>
            <span>New venture</span>
            <h2 id="venture-create-title">Connect a product</h2>
            <p>Its repository, work, evidence, and decisions stay isolated from every other venture.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close new venture">
            <X aria-hidden="true" />
          </button>
        </header>
        <VentureCreateForm ventures={ventures} onCreated={onCreated} />
      </div>
    </div>
  );
}
