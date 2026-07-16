import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function FirmLensEmpty() {
  const [visible, setVisible] = useState(true);
  if (!visible) return null;

  return (
    <section className="firm-lens-empty" aria-labelledby="firm-lens-empty-title">
      <div className="firm-lens-empty-kicker"><span aria-hidden="true" /> First work</div>
      <h2 id="firm-lens-empty-title">Start with one open direction.</h2>
      <p>Use the composer beside this canvas. Drover reads the bound repository, cites what it finds, and teammates begin useful work worth trying. Nothing leaves without your hand.</p>
      <Button
        type="button"
        variant="ghost"
        size="xs"
        className="pointer-events-auto mt-3"
        onClick={() => setVisible(false)}
      >
        <X aria-hidden="true" /> Dismiss first-work help
      </Button>
    </section>
  );
}
